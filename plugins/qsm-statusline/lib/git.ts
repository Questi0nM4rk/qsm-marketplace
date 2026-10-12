// The git segment.

import { spawnSync } from "node:child_process";

export interface GitState {
  readonly branch: string | null;
  readonly staged: number;
  readonly modified: number;
  readonly untracked: number;
  readonly conflicts: number;
}

const BRANCH_LINE = "# branch.head ";

export function isClean(state: GitState): boolean {
  return state.staged + state.modified + state.untracked + state.conflicts === 0;
}

interface Counts {
  staged: number;
  modified: number;
  untracked: number;
  conflicts: number;
}

/** "1 <XY> ...": X is the staged change, Y the unstaged one, "." neither. */
function countChanged(line: string, counts: Counts): void {
  if (line[2] !== undefined && line[2] !== ".") {
    counts.staged += 1;
  }
  if (line[3] !== undefined && line[3] !== ".") {
    counts.modified += 1;
  }
}

function countLine(line: string, counts: Counts): void {
  if (line.startsWith("? ")) {
    counts.untracked += 1;
  } else if (line.startsWith("u ")) {
    counts.conflicts += 1;
  } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
    countChanged(line, counts);
  }
}

function branchOf(lines: readonly string[]): string | null {
  const line = lines.find((l) => l.startsWith(BRANCH_LINE));
  if (line === undefined) {
    return null;
  }
  const head = line.slice(BRANCH_LINE.length).trim();
  return head === "(detached)" ? "detached" : head;
}

/** An unmerged path is counted on its own. `git diff` reports it as modified,
 * so a conflict is otherwise indistinguishable from an ordinary edit. */
export function parsePorcelain(output: string): GitState {
  const lines = output.split("\n");
  const counts: Counts = { staged: 0, modified: 0, untracked: 0, conflicts: 0 };
  for (const line of lines) {
    countLine(line, counts);
  }
  return { branch: branchOf(lines), ...counts };
}

/** null means there is no git state to show: no repository, no git binary, or
 * a call that failed. The caller omits the segment; it never renders an error. */
export function gitState(cwd: string): GitState | null {
  const result = spawnSync("git", ["-C", cwd, "status", "--porcelain=v2", "--branch"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0 || typeof result.stdout !== "string") {
    return null;
  }
  return parsePorcelain(result.stdout);
}
