// The project key of a working directory: the main checkout's root, so every worktree of a
// repository shares its notes and groups its sessions; the directory itself outside git.

import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import type { Env } from "./store.ts";

// No repository there, or the directory is gone (a removed worktree): the directory is the key.
// A git that is missing or refuses (safe.directory) says nothing about it and fails loud.
const NOT_IN_GIT = /not a git repository|cannot change to/;

export function projectOf(cwd: string, env: Env = process.env): string {
  const r = spawnSync(
    "git",
    ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    { encoding: "utf8", env: { ...env } },
  );
  if (r.status !== 0) {
    if (NOT_IN_GIT.test(r.stderr)) {
      return cwd;
    }
    throw new Error(
      `git rev-parse in ${cwd} failed: ${(r.error?.message ?? r.stderr).trim().slice(0, 200)}`,
    );
  }
  return dirname(r.stdout.trim());
}
