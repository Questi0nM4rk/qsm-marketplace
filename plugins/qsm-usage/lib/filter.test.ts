import { describe, expect, test } from "bun:test";
import { runsGit } from "./filter.ts";

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
