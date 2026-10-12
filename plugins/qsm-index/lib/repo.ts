// The git repository a path lives in.

import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Runner, RunResult } from "./run.ts";

/** The top level of the git repository holding `dir`, in `stdout`, or git's cause. */
export function topLevel(dir: string, run: Runner): RunResult {
  const found = run("git", ["-C", dir, "rev-parse", "--show-toplevel"]);
  return found.ok ? { ...found, stdout: found.stdout.trim() } : found;
}

/** The full sha HEAD names, or null in a repository with no commit yet. */
export function head(top: string, run: Runner): string | null {
  const rev = run("git", ["-C", top, "rev-parse", "HEAD"]);
  const sha = rev.stdout.trim();
  return rev.ok && sha.length > 0 ? sha : null;
}

/** How many commits HEAD is ahead of `from`, or null when git no longer knows `from`. */
export function commitsSince(top: string, from: string, run: Runner): number | null {
  const counted = run("git", ["-C", top, "rev-list", "--count", `${from}..HEAD`]);
  const n = Number(counted.stdout.trim());
  return counted.ok && Number.isInteger(n) ? n : null;
}

/** The exclude file git reads for the repository at `top` (in a linked worktree, the one git
 * names there), or null when git cannot answer. */
export function excludeFile(top: string, run: Runner): string | null {
  const named = run("git", ["-C", top, "rev-parse", "--git-path", "info/exclude"]);
  const path = named.stdout.trim();
  return named.ok && path.length > 0 ? resolve(top, path) : null;
}

/** The graph's own directory is the build's output, never a change to the source. The exclude
 * line hides it while untracked; a repository that tracks its graph still sees it change. */
const OWN_OUTPUT = "graphify-out/";

function fingerprint(path: string): string {
  try {
    const stat = statSync(path);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "deleted";
  }
}

/** Every changed path, tracked and untracked, relative to the top level, with its mtime and size
 * (`deleted` when it is gone). Empty when git cannot answer. */
export function changedSet(top: string, run: Runner): Record<string, string> {
  const listed = run("git", ["-C", top, "status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const changed: Record<string, string> = {};
  if (!listed.ok) {
    return changed;
  }
  let sourceOfRename = false;
  for (const entry of listed.stdout.split("\0")) {
    if (sourceOfRename || entry.length < 4) {
      sourceOfRename = false;
      continue;
    }
    // A rename or copy carries its source path as the next entry.
    sourceOfRename = entry[0] === "R" || entry[0] === "C";
    const path = entry.slice(3);
    if (!path.startsWith(OWN_OUTPUT)) {
      changed[path] = fingerprint(join(top, path));
    }
  }
  return changed;
}
