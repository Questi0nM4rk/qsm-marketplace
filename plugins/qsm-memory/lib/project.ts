// The project key of a working directory: the main checkout's root, so every worktree of a
// repository shares its notes and groups its sessions; the directory itself outside git.

import { spawnSync } from "node:child_process";
import { dirname } from "node:path";

export function projectOf(cwd: string): string {
  const r = spawnSync(
    "git",
    ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    {
      encoding: "utf8",
    },
  );
  if (r.status !== 0) {
    return cwd;
  }
  return dirname(r.stdout.trim());
}
