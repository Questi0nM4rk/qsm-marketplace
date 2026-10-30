// One lock in the state directory: sync and ensure take it, so concurrent teammate launches start
// one daemon and two syncs never interleave. It is flock(2) on router.lock, so the kernel releases
// it the moment its holder exits, however it exits: there is no stale lock to take over, so no
// pid check, no unlink race between two takers and no reused pid that blocks every taker. Rename or
// unlink takeovers only narrow that race; "the holder is dead, so replace its file" cannot be one
// atomic step. The file is never removed: a taker that locked a removed file would hold nothing.
import { dlopen, FFIType } from "bun:ffi";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { sleep } from "bun";
import { QsmError } from "../../../lib/qsm-error.ts";

const POLL_MS = 10;
/** LOCK_EX (2) with LOCK_NB (4): exclusive, and an answer at once instead of a wait */
const LOCK_EX_NB = 6;

let flock: ((fd: number, op: number) => number) | undefined;

function tryFlock(fd: number): boolean {
  if (flock === undefined) {
    const libc = dlopen(process.platform === "darwin" ? "libc.dylib" : "libc.so.6", {
      flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    });
    flock = (f, op) => libc.symbols.flock(f, op);
  }
  return flock(fd, LOCK_EX_NB) === 0;
}

function lockFile(stateDir: string): number {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  // closing the descriptor releases the lock; a child spawned meanwhile never inherits it
  return openSync(join(stateDir, "router.lock"), "a", 0o600);
}

/** Whether another process holds the lock now: a look that never waits and keeps nothing. */
export function lockHeld(stateDir: string): boolean {
  const fd = lockFile(stateDir);
  try {
    return !tryFlock(fd);
  } finally {
    closeSync(fd);
  }
}

export async function withLock<T>(
  stateDir: string,
  body: () => T | Promise<T>,
  waitMs: number,
): Promise<T> {
  const fd = lockFile(stateDir);
  try {
    const until = Date.now() + waitMs;
    while (!tryFlock(fd)) {
      if (Date.now() > until) {
        // a refusal, never a crash: the verb's boundary answers blocked
        throw new QsmError(
          "blocked",
          `${join(stateDir, "router.lock")} is held by another qsm-ccr for over ${waitMs / 1000} s; run again once it ends`,
        );
      }
      await sleep(POLL_MS);
    }
    return await body();
  } finally {
    closeSync(fd);
  }
}
