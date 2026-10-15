import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { projectOf } from "./project.ts";

describe("projectOf", () => {
  test("a directory outside git, or one that is gone, is its own project", () => {
    const dir = sandboxDir("qsm-memory-project-");
    expect(projectOf(dir)).toBe(dir);
    expect(projectOf(join(dir, "removed-worktree"))).toBe(join(dir, "removed-worktree"));
  });

  test("a git that cannot run is an error, not 'outside git'", () => {
    expect(() => projectOf(sandboxDir("qsm-memory-project-"), { PATH: "/nonexistent" })).toThrow(
      "git rev-parse",
    );
  });
});
