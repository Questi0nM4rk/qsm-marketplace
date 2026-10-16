// The caches a run keeps in the checkout it checks: each is a directory
// under `.qsm-langdev/` that ignores itself, written one whole file at a time.

import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../../../lib/fs.ts";

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
