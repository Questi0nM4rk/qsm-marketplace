import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { gitState, isClean, parsePorcelain } from "./git.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

// Every sandbox this file makes is removed after the test that made it,
// passing or failing: a `finally` inside one test would leave the rest.
function git(cwd: string, ...args: string[]): void {
  spawnSync("git", ["-C", cwd, ...args], { stdio: "ignore" });
}

/** A repository with its own identity and no global configuration in play,
 * so the branch name and the commit do not depend on whose machine runs it. */
function repository(): string {
  const dir = sandboxDir("qsm-statusline-git-");
  git(dir, "init", "-b", "main");
  git(dir, "config", "user.email", "test@example.invalid");
  git(dir, "config", "user.name", "test");
  writeFileSync(join(dir, "kept.txt"), "kept\n");
  git(dir, "add", "kept.txt");
  git(dir, "commit", "-m", "first");
  return dir;
}

describe("parsePorcelain", () => {
  test("reads the branch and every counter out of one status call", () => {
    const state = parsePorcelain(
      [
        "# branch.oid abc123",
        "# branch.head feature",
        "1 M. N... 100644 100644 100644 aaa bbb staged.txt",
        "1 .M N... 100644 100644 100644 aaa bbb modified.txt",
        "1 MM N... 100644 100644 100644 aaa bbb both.txt",
        "? untracked.txt",
        "u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.txt",
      ].join("\n"),
    );
    expect(state).toEqual({
      branch: "feature",
      staged: 2,
      modified: 2,
      untracked: 1,
      conflicts: 1,
    });
  });

  test("names a detached head rather than printing git's parenthesis", () => {
    expect(parsePorcelain("# branch.head (detached)\n").branch).toBe("detached");
  });

  test("a repository with nothing to report is clean", () => {
    const state = parsePorcelain("# branch.head main\n");
    expect(isClean(state)).toBe(true);
    expect(state.branch).toBe("main");
  });
});

describe("gitState", () => {
  test("reports the branch and no changes in a freshly committed repository", () => {
    const state = gitState(repository());
    expect(state?.branch).toBe("main");
    expect(state === null ? null : isClean(state)).toBe(true);
  });

  test("counts staged, modified, and untracked paths separately", () => {
    const dir = repository();
    writeFileSync(join(dir, "added.txt"), "added\n");
    git(dir, "add", "added.txt");
    writeFileSync(join(dir, "kept.txt"), "changed\n");
    writeFileSync(join(dir, "loose.txt"), "loose\n");
    expect(gitState(dir)).toEqual({
      branch: "main",
      staged: 1,
      modified: 1,
      untracked: 1,
      conflicts: 0,
    });
  });

  test("a directory that is not a repository has no git state to show", () => {
    expect(gitState(sandboxDir("qsm-statusline-git-"))).toBeNull();
  });
});
