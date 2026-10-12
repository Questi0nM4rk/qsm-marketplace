import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitReader, readMainCheckout, readWorkspace, workspaceContext } from "./workspace.ts";
import type { Runner } from "./wt.ts";

// Every sandbox this file makes is removed after the test that made it,
// passing or failing: a `finally` inside one test would leave the rest.
const sandboxes: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "qsm-worktrunk-"));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  while (sandboxes.length > 0) {
    const dir = sandboxes.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

const run: Runner = (argv, cwd) => {
  const [command, ...args] = argv;
  const result = spawnSync(command ?? "", args, { cwd, encoding: "utf8" });
  return Promise.resolve({
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  });
};

/** A repository with one commit, and one linked workspace beside it. The
 * workspace is made with raw git on purpose: the sandbox must not depend on
 * wt being installed to prove that detection reads what git reports. */
function repository(): { main: string; workspace: string } {
  const dir = sandbox();
  const main = join(dir, "main");
  const workspace = join(dir, "feature");
  const git = (...args: string[]): void => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if ((result.status ?? 1) !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    }
  };
  git("init", "-q", "-b", "main", main);
  const inMain = (...args: string[]): void => {
    const result = spawnSync("git", ["-C", main, ...args], { encoding: "utf8" });
    if ((result.status ?? 1) !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    }
  };
  inMain("config", "user.email", "test@example.invalid");
  inMain("config", "user.name", "test");
  inMain("commit", "-q", "--allow-empty", "-m", "first");
  inMain("worktree", "add", "-q", "-b", "feature", workspace);
  return { main, workspace };
}

describe("readWorkspace", () => {
  test("inside a linked workspace: its name, its path, and its branch", async () => {
    const { workspace } = repository();
    const found = await readWorkspace(gitReader(run, workspace));
    expect(found?.name).toBe("feature");
    expect(found?.branch).toBe("feature");
    expect(found?.path).toEndWith("/feature");
  });

  test("Working from the main checkout", async () => {
    const { main } = repository();
    expect(await readWorkspace(gitReader(run, main))).toBeNull();
  });

  test("outside a repository: nothing", async () => {
    expect(await readWorkspace(gitReader(run, sandbox()))).toBeNull();
  });

  test("a detached head reads as detached, not as a missing branch", async () => {
    const { workspace } = repository();
    spawnSync("git", ["-C", workspace, "checkout", "-q", "--detach"], { encoding: "utf8" });
    const found = await readWorkspace(gitReader(run, workspace));
    expect(found?.branch).toStartWith("detached at ");
  });
});

describe("readMainCheckout", () => {
  test("every workspace of a repository answers the same main checkout", async () => {
    const { main, workspace } = repository();
    const fromWorkspace = await readMainCheckout(gitReader(run, workspace));
    const fromMain = await readMainCheckout(gitReader(run, main));
    expect(fromWorkspace).toBe(fromMain ?? "");
    expect(fromWorkspace).toEndWith("/main");
  });

  test("outside a repository: nothing", async () => {
    expect(await readMainCheckout(gitReader(run, sandbox()))).toBeNull();
  });
});

describe("workspaceContext", () => {
  const workspace = { name: "feature", path: "/home/person/work/feature", branch: "feature" };

  test("carries the name, the path, and the branch", () => {
    const text = workspaceContext(workspace);
    expect(text).toContain("workspace: feature");
    expect(text).toContain("path: /home/person/work/feature");
    expect(text).toContain("branch: feature");
  });

  test("a path under the home directory is shortened", () => {
    expect(workspaceContext(workspace, "/home/person")).toContain("path: ~/work/feature");
  });
});
