// The capture index: what each captured entry was, when, and where, kept beside the vault because
// the vault stores only a name, a folder and a mark. Never a value or any part of one: the file is
// plain text in the home directory. The one reader and writer of the file.

import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sleepSync } from "bun";
import { tryFlock, writeAtomic } from "../../../lib/fs.ts";
import { isRecord } from "../../../lib/outcome.ts";
import { dataDir, type Env } from "../../../lib/paths.ts";
import { type CaptureRow, isRow } from "./capture-row.ts";
import { fail } from "./errors.ts";

/** Every row, by its `rowId`. */
export type CaptureIndex = Record<string, CaptureRow>;

const LOCK_WAIT_MS = 5000;
const POLL_MS = 10;

function indexPath(env: Env): string {
  return join(dataDir(env), "qsm-secrets", "captures.json");
}

/** The index as stored; empty when there is no file yet. A file of any other shape is refused. */
function readIndex(path: string): CaptureIndex {
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
 * `<index>.lock`, so two captures at once both keep their rows. A `change` that returns the index it
 * was given writes nothing, and with no index file yet it makes neither the file nor the lock.
 */
function updateIndex(env: Env, change: (index: CaptureIndex) => CaptureIndex): void {
  const path = indexPath(env);
  const empty: CaptureIndex = {};
  if (!existsSync(path) && change(empty) === empty) {
    return;
  }
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

/** Every row of the index. */
export function readRows(env: Env): CaptureIndex {
  return readIndex(indexPath(env));
}

/** Files each row under its id, replacing a row the id already had. */
export function addRows(env: Env, rows: Readonly<CaptureIndex>): void {
  updateIndex(env, (index) => ({ ...index, ...rows }));
}

/** Drops the rows of `ids`; an index that holds none of them is left as it is. */
export function forgetRows(env: Env, ids: readonly string[]): void {
  updateIndex(env, (index) =>
    ids.some((id) => Object.hasOwn(index, id))
      ? Object.fromEntries(Object.entries(index).filter(([id]) => !ids.includes(id)))
      : index,
  );
}

/** Files the row of `from` under `to`, its kind, time, session and cwd kept; none, nothing moves. */
export function moveRow(env: Env, from: string, to: string): void {
  updateIndex(env, (index) => {
    const row = index[from];
    if (row === undefined) {
      return index;
    }
    const { [from]: _moved, ...rest } = index;
    return { ...rest, [to]: row };
  });
}
