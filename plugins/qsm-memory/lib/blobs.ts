// The blob store: the bytes of images and file snapshots, beside the archive, named by their
// sha256 so the same bytes are stored once and a stored blob never changes.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeAtomic } from "../../../lib/fs.ts";
import { QsmError } from "../../../lib/qsm-error.ts";
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
    throw new QsmError("missing", `no file at ${file}`, {
      next: "pass the path of an existing file",
    });
  }
  return putBytes(env, readFileSync(file));
}

/** `putBlob` for bytes already in memory, such as an image read out of a transcript. */
export function putBytes(env: Env, bytes: Uint8Array): PutResult {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = pathOf(env, sha256);
  if (existsSync(path)) {
    return { sha256, path, stored: false };
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeAtomic(path, bytes, 0o600);
  return { sha256, path, stored: true };
}

/** The path of a stored blob. */
export function blobPath(env: Env, sha256: string): string {
  if (!SHA256.test(sha256)) {
    throw new QsmError("usage", `'${sha256}' is not a sha256`, {
      next: "pass the 64 hex characters that blob put printed",
    });
  }
  const path = pathOf(env, sha256);
  if (!existsSync(path)) {
    throw new QsmError("missing", `no blob ${sha256}`, {
      next: "store the file first with qsm-memory blob put <file>",
    });
  }
  return path;
}
