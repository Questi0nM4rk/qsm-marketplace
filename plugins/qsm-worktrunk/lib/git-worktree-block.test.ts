import { describe, expect, test } from "bun:test";
import { denialFor } from "./git-worktree-block.ts";

describe("denialFor, on a raw git worktree command", () => {
  test("Agent attempts to add a workspace with raw git", () => {
    const cases: [string, string][] = [
      ["git worktree add ../tree feature", "wt switch --create"],
      ["git worktree list", "wt list"],
      ["git worktree remove ../tree", "wt remove"],
      ["git worktree prune", "wt list"],
      ["git worktree move ../a ../b", "wt switch"],
      ["git worktree lock ../tree", "wt config"],
      ["git worktree unlock ../tree", "wt config"],
      ["git worktree repair", "wt list"],
    ];
    for (const [command, replacement] of cases) {
      const denial = denialFor(command);
      expect(denial).toContain(replacement);
      expect(denial).toContain("qsm-worktrunk");
    }
  });

  test("a bare git worktree, and an unknown subcommand, still deny", () => {
    expect(denialFor("git worktree")).toContain("wt --help");
    expect(denialFor("git worktree teleport x")).toContain("wt --help");
  });
});

describe("denialFor, on a command that hides the subcommand", () => {
  test("git's own options before the subcommand do not hide it", () => {
    expect(denialFor("git -C /tmp/repo worktree add ../tree")).not.toBeNull();
    expect(denialFor("git --git-dir /tmp/repo/.git worktree list")).not.toBeNull();
    expect(denialFor("git -c core.editor=true worktree prune")).not.toBeNull();
    expect(denialFor("/usr/bin/git worktree list")).not.toBeNull();
    expect(denialFor("sudo git worktree remove ../tree")).not.toBeNull();
    expect(denialFor("rtk git worktree lock /x")).not.toBeNull();
    expect(denialFor("GIT_PAGER=cat git worktree list")).not.toBeNull();
  });

  test("a worktree command anywhere in the line is found", () => {
    expect(denialFor("cd /tmp/repo && git worktree add ../tree feature")).not.toBeNull();
    expect(denialFor("git status; git worktree list")).not.toBeNull();
    expect(denialFor("git worktree list | head -3")).not.toBeNull();
  });
});

describe("denialFor, on a command that is not one", () => {
  test("git commands that are not worktree commands pass", () => {
    for (const command of [
      "git status",
      "git log --oneline -5",
      "git branch -a",
      "git -C /tmp/repo commit -m 'worktree'",
      "wt switch --create feature",
      "wt list",
    ]) {
      expect(denialFor(command)).toBeNull();
    }
  });

  test("the words inside a quoted string are text, not a command", () => {
    expect(denialFor('echo "git worktree add ../tree"')).toBeNull();
    expect(denialFor("grep -r 'git worktree list' docs/")).toBeNull();
    expect(denialFor("git commit -m 'git worktree add is blocked'")).toBeNull();
  });

  test("a command that only looks like git passes", () => {
    expect(denialFor("gitk worktree list")).toBeNull();
    expect(denialFor("mygit worktree add x")).toBeNull();
  });
});
