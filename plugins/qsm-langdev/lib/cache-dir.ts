// The caches a run keeps in the checkout it checks: each is a directory
// under `.qsm-langdev/` that ignores itself, written one whole file at a time.

import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** `.qsm-langdev/<name>` under `root`, created with a `.gitignore` of `*`, so
 * a repository that never listed it in its own .gitignore still sees nothing
 * untracked, and nobody edits that repository's .gitignore. The cache
 * directory ignores itself, not `.qsm-langdev/`: `.qsm-langdev/gates.json`
 * is the repository's to commit. */
export function cacheDir(root: string, name: string): string {
  const dir = join(root, ".qsm-langdev", name);
  const ignore = join(dir, ".gitignore");
  try {
    statSync(ignore);
  } catch {
    mkdirSync(dir, { recursive: true });
    writeAtomic(ignore, "*\n");
  }
  return dir;
}

/** Writes `text` to `path` through a tmp file and a rename, so a reader
 * never sees half a file, even with two runs writing the same path. */
export function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}
