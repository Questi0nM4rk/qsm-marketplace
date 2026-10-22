import { describe, expect, test } from "bun:test";
import { filterChangesMeaning, redirectsToFile, runsGit } from "./filter.ts";

describe("runsGit", () => {
  test("a bare git command runs git", () => {
    expect(runsGit("git branch --show-current")).toBe(true);
  });

  test("a non-git command does not run git", () => {
    expect(runsGit("echo hello")).toBe(false);
  });

  test("git anywhere in a chained command still runs git", () => {
    expect(runsGit("pwd && git status")).toBe(true);
    expect(runsGit("git status || echo failed")).toBe(true);
    expect(runsGit("echo one; git log")).toBe(true);
    expect(runsGit("git diff | less")).toBe(true);
  });

  test("a command that merely mentions git does not run git", () => {
    expect(runsGit("echo git status")).toBe(false);
  });
});

describe("redirectsToFile", () => {
  test("stdout redirects to a file", () => {
    for (const c of ["ls > out.txt", "ls >> out.txt", "ls >out.txt", "ls 1> o", "ls &> o"]) {
      expect(redirectsToFile(c)).toBe(true);
    }
  });

  test("stderr-only redirects and plain commands do not", () => {
    for (const c of ["ls", "ls 2>&1", "ls 2> err", "ls >&2", "ls | wc -l"]) {
      expect(redirectsToFile(c)).toBe(false);
    }
  });
});

describe("filterChangesMeaning", () => {
  test("git log, grep and find keep their own output", () => {
    for (const c of [
      "git log --oneline -5",
      "grep -n 'a\\|b' f",
      "find . -name x",
      "cd p && git log",
    ]) {
      expect(filterChangesMeaning(c)).toBe(true);
    }
  });

  test("other commands still go through the filter", () => {
    for (const c of ["git status", "git diff", "bun test", "echo grep", "ls"]) {
      expect(filterChangesMeaning(c)).toBe(false);
    }
  });
});
