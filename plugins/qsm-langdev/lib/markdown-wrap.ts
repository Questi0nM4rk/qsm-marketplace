// MD013 (line length) is the one markdown rule fixed by rewriting, so it is never reported: rumdl
// reflows the prose of the files it is given. It reads the repository's own markdownlint config for
// the length, the code blocks and the tables, so what it wraps to is what markdownlint then checks.
// Every other markdown rule is left to markdownlint-cli2, which reports it as before.

import { spawnSync } from "node:child_process";

export const isMarkdown = (path: string): boolean => /\.(md|markdown)$/i.test(path);

/** Rewraps `files` (relative to `root`) in place. False when rumdl is not on PATH: nothing was
 * rewrapped, and markdownlint reports the long lines as it always did. */
export function rewrapMarkdown(root: string, files: readonly string[]): boolean {
  if (files.length === 0) {
    return false;
  }
  const result = spawnSync(
    "rumdl",
    [
      "check",
      "--fix",
      "--quiet",
      "--no-cache",
      "--enable",
      "MD013",
      "--config",
      "MD013.reflow = true",
      ...files,
    ],
    { cwd: root, stdio: "ignore" },
  );
  return result.error === undefined;
}
