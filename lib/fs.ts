// The file helpers two plugins needed: an atomic write, and an exclusive lock on a descriptor.
import { dlopen, FFIType } from "bun:ffi";
import { randomUUID } from "node:crypto";
import { renameSync, rmSync, writeFileSync } from "node:fs";

/** Writes `text` (or bytes) to `path` through a tmp file and a rename, so a reader never sees half a file,
 * even with two runs writing the same path; a failed rename removes the tmp file. */
export function writeAtomic(path: string, text: string | Uint8Array, mode?: number): void {
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmp, text, mode === undefined ? undefined : { mode });
  try {
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

/** LOCK_EX (2) with LOCK_NB (4): exclusive, and an answer at once instead of a wait. */
const LOCK_EX_NB = 6;

let flock: ((fd: number, op: number) => number) | undefined;

/**
 * Takes an exclusive flock(2) on `fd` without waiting: true when this descriptor holds it now. The
 * kernel drops it the moment the descriptor closes or its process exits, however it exits, so there
 * is never a stale lock to take over and the lock file is never removed.
 */
export function tryFlock(fd: number): boolean {
  if (flock === undefined) {
    const libc = dlopen(process.platform === "darwin" ? "libc.dylib" : "libc.so.6", {
      flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    });
    flock = (f, op) => libc.symbols.flock(f, op);
  }
  return flock(fd, LOCK_EX_NB) === 0;
}
