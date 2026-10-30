// What a repository's cache directory says about its builds: the lock a running build holds, and
// the status file every build writes.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isAlive } from "../../../lib/detach.ts";
import { writeAtomic } from "../../../lib/fs.ts";
import { isRecord } from "../../../lib/outcome.ts";

export interface Lock {
  readonly pid: number;
  readonly started_at: string;
}

/** The errno code of a caught error, or undefined when it carries none. */
export function errnoCode(cause: unknown): string | undefined {
  return isRecord(cause) && typeof cause.code === "string" ? cause.code : undefined;
}

function parseLock(value: unknown): Lock | null {
  return isRecord(value) && typeof value.pid === "number" && value.pid > 0
    ? { pid: value.pid, started_at: String(value.started_at) }
    : null;
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** The lock, when a live process holds it; null when there is none or its process is dead. */
export function liveHolder(file: string): Lock | null {
  const lock = parseLock(readJson(file));
  return lock !== null && isAlive(lock.pid) ? lock : null;
}

export type LockTake = { readonly taken: true } | { readonly taken: false; readonly holder: Lock };

/** True when this call created the file; false when it was already there. */
function createOnce(file: string, content: string): boolean {
  try {
    writeFileSync(file, content, { flag: "wx" });
    return true;
  } catch (cause) {
    if (errnoCode(cause) === "EEXIST") {
      return false;
    }
    throw cause;
  }
}

/** Creates the lock for this process; a lock left by a dead process is removed and taken once. */
export function takeLock(file: string, now: Date): LockTake {
  mkdirSync(dirname(file), { recursive: true });
  const mine = { pid: process.pid, started_at: now.toISOString() };
  if (createOnce(file, JSON.stringify(mine))) {
    return { taken: true };
  }
  const holder = liveHolder(file);
  if (holder !== null) {
    return { taken: false, holder };
  }
  rmSync(file, { force: true });
  if (createOnce(file, JSON.stringify(mine))) {
    return { taken: true };
  }
  // Another build took the stale lock between the remove and the create.
  return { taken: false, holder: parseLock(readJson(file)) ?? mine };
}

/** Removes the lock when this process holds it, and leaves anyone else's alone. */
export function releaseLock(file: string): void {
  if (parseLock(readJson(file))?.pid === process.pid) {
    rmSync(file, { force: true });
  }
}

export type BuildResult = "ok" | "partial" | "failed";

export interface BuildStatus {
  readonly repo: string;
  readonly state: "running" | "done";
  readonly phase: "graph" | "semantic" | null;
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly duration_ms: number | null;
  readonly result: BuildResult | null;
  readonly cause: string | null;
  readonly built_at_commit: string | null;
  readonly changed_at_build: Readonly<Record<string, string>>;
  /** Why the graph does not land in the cache, when it does not: a foreign graphify-out symlink. */
  readonly warning: string | null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

/** A guard for a field that is either null or what `guard` accepts. */
function nullable<T>(guard: (item: unknown) => item is T): (value: unknown) => value is T | null {
  return (value): value is T | null => value === null || guard(value);
}

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number";
const isState = (value: unknown): value is "running" | "done" =>
  value === "running" || value === "done";
const isPhase = (value: unknown): value is "graph" | "semantic" =>
  value === "graph" || value === "semantic";
const isResult = (value: unknown): value is BuildResult =>
  value === "ok" || value === "partial" || value === "failed";

/** One guard per field of the status file, so no field a reader uses goes unchecked. */
const STATUS_FIELDS: {
  readonly [K in keyof BuildStatus]-?: (value: unknown) => value is BuildStatus[K];
} = {
  repo: isString,
  state: isState,
  phase: nullable(isPhase),
  started_at: isString,
  finished_at: nullable(isString),
  duration_ms: nullable(isNumber),
  result: nullable(isResult),
  cause: nullable(isString),
  built_at_commit: nullable(isString),
  changed_at_build: isStringRecord,
  warning: nullable(isString),
};

function hasStatusFields(
  value: Record<string, unknown>,
): value is Record<string, unknown> & BuildStatus {
  return Object.entries(STATUS_FIELDS).every(([field, guard]) => guard(value[field]));
}

/** The status when every field a reader uses has its type; null for anything else. */
function parseStatus(value: unknown): BuildStatus | null {
  if (!(isRecord(value) && hasStatusFields(value))) {
    return null;
  }
  const { repo, state, phase, started_at, finished_at, duration_ms, result, cause } = value;
  const { built_at_commit, changed_at_build, warning } = value;
  return {
    repo,
    state,
    phase,
    started_at,
    finished_at,
    duration_ms,
    result,
    cause,
    built_at_commit,
    changed_at_build,
    warning,
  };
}

/** The status file, or null when no build ever wrote one. */
export function readStatus(file: string): BuildStatus | null {
  return parseStatus(readJson(file));
}

/** How many paths differ, in either direction, between the changed set a build started from and
 * the changed set now: a file dirty at build time and untouched since is already in the graph. */
export function changedSince(
  atBuild: Readonly<Record<string, string>>,
  now: Readonly<Record<string, string>>,
): number {
  const paths = new Set([...Object.keys(atBuild), ...Object.keys(now)]);
  return [...paths].filter((path) => atBuild[path] !== now[path]).length;
}

export function writeStatus(file: string, status: BuildStatus): void {
  writeAtomic(file, `${JSON.stringify(status, null, 2)}\n`);
}
