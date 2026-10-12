// The commits on the branch checked out at `cwd` since a moment, newest first, read from `git log`.
// Outside a repository, or in one with no commit yet, there are none; any other git failure is loud.

import { spawnSync } from "node:child_process";

export interface Commit {
  readonly at: string;
  readonly subject: string;
}

const NO_HISTORY = /not a git repository|does not have any commits/;

export function commitsSince(cwd: string, since: string): Commit[] {
  const r = spawnSync("git", ["-C", cwd, "log", `--since=${since}`, "--format=%cI%x09%s", "HEAD"], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    if (NO_HISTORY.test(r.stderr)) {
      return [];
    }
    throw new Error(`git log in ${cwd} failed: ${r.stderr.trim().slice(0, 200)}`);
  }
  return r.stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const tab = line.indexOf("\t");
      return { at: line.slice(0, tab), subject: line.slice(tab + 1) };
    });
}
