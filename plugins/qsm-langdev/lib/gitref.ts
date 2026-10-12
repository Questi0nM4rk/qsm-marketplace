// One place to turn a name into a commit id.

import { spawnSync } from "node:child_process";

/** `ref` as a commit id, or null when it names none (including "no commits
 * yet", which is not an error — a fresh repository has no HEAD). */
export function resolveRef(root: string, ref: string): string | null {
  const result = spawnSync("git", ["rev-parse", "--verify", "-q", ref], {
    cwd: root,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : null;
}
