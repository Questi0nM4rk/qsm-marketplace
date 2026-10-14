// The blob store: the bytes of images and file snapshots, beside the archive, named by their
// sha256 so the same bytes are stored once and a stored blob never changes.

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fail } from "./errors.ts";
import { type Env, resolveDbPath } from "./store.ts";

const SHA256 = /^[0-9a-f]{64}$/;

/** `blobs/` in the archive's directory, so `QSM_MEMORY_DB` moves both together. */
export function blobDir(env: Env): string {
  return join(dirname(resolveDbPath(env)), "blobs");
}

const pathOf = (env: Env, sha256: string) =>
  join(blobDir(env), "sha256", sha256.slice(0, 2), sha256);

export interface PutResult {
  sha256: string;
  path: string;
  /** false when the same bytes were already stored */
  stored: boolean;
}

/** Stores a file's bytes under their sha256, owner-only; a second put of the same bytes writes nothing. */
export function putBlob(env: Env, file: string): PutResult {
  if (!existsSync(file)) {
    fail("not-found", `no file at ${file}`, "pass the path of an existing file");
  }
  const bytes = readFileSync(file);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = pathOf(env, sha256);
  if (existsSync(path)) {
    return { sha256, path, stored: false };
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // a rename in the same directory is atomic, so a reader never sees half a blob
  const partial = `${path}.${process.pid}.partial`;
  writeFileSync(partial, bytes, { mode: 0o600 });
  chmodSync(partial, 0o600);
  renameSync(partial, path);
  return { sha256, path, stored: true };
}

/** The path of a stored blob. */
export function blobPath(env: Env, sha256: string): string {
  if (!SHA256.test(sha256)) {
    fail(
      "usage",
      `'${sha256}' is not a sha256`,
      "pass the 64 hex characters that blob put printed",
    );
  }
  const path = pathOf(env, sha256);
  if (!existsSync(path)) {
    fail("not-found", `no blob ${sha256}`, "store the file first with qsm-memory blob put <file>");
  }
  return path;
}
