// The capture index: what each captured entry was, when, and where, kept beside the vault because
// the vault stores only a name, a folder and a mark. Never a value or any part of one: the file is
// plain text in the home directory.

import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sleepSync } from "bun";
import { tryFlock, writeAtomic } from "../../../lib/fs.ts";
import { isRecord } from "../../../lib/outcome.ts";
import { dataDir, type Env } from "../../../lib/paths.ts";
import { fail } from "./errors.ts";

/** One captured entry, keyed `<namespace>/<key>` in the file. */
export interface CaptureRow {
  readonly kind: string;
  /** ISO 8601, UTC. */
  readonly capturedAt: string;
  readonly session: string | null;
  readonly cwd: string | null;
}

export type CaptureIndex = Record<string, CaptureRow>;

const LOCK_WAIT_MS = 5000;
const POLL_MS = 10;

export function indexPath(env: Env): string {
  return join(dataDir(env), "qsm-secrets", "captures.json");
}

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

function isRow(value: unknown): value is CaptureRow {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    typeof value.capturedAt === "string" &&
    isNullableString(value.session) &&
    isNullableString(value.cwd)
  );
}

/** The index as stored; empty when there is no file yet. A file of any other shape is refused. */
export function readIndex(path: string): CaptureIndex {
  if (!existsSync(path)) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    parsed = undefined;
  }
  const refused = (): never =>
    fail(`${path} is not a capture index`, "fix it, or delete it to start an empty index", "usage");
  if (!isRecord(parsed)) {
    return refused();
  }
  const index: CaptureIndex = {};
  for (const [id, row] of Object.entries(parsed)) {
    index[id] = isRow(row) ? row : refused();
  }
  return index;
}

/**
 * Reads the index, hands it to `change`, and writes what comes back, under an exclusive flock(2) on
 * `<index>.lock`, so two captures at once both keep their rows.
 */
export function updateIndex(path: string, change: (index: CaptureIndex) => CaptureIndex): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const fd = openSync(`${path}.lock`, "a", 0o600);
  try {
    const until = Date.now() + LOCK_WAIT_MS;
    while (!tryFlock(fd)) {
      if (Date.now() > until) {
        fail(
          `${path}.lock is held by another qsm-secrets for over ${LOCK_WAIT_MS / 1000} s`,
          "run it again once that one ends",
          "blocked",
        );
      }
      sleepSync(POLL_MS);
    }
    const before = readIndex(path);
    const after = change(before);
    if (after !== before) {
      writeAtomic(path, `${JSON.stringify(after, null, 2)}\n`, 0o600);
    }
  } finally {
    closeSync(fd);
  }
}

/** The index without the rows of `ids`; the same object when it holds none of them. */
export function withoutRows(index: CaptureIndex, ids: readonly string[]): CaptureIndex {
  if (!ids.some((id) => Object.hasOwn(index, id))) {
    return index;
  }
  return Object.fromEntries(Object.entries(index).filter(([id]) => !ids.includes(id)));
}
