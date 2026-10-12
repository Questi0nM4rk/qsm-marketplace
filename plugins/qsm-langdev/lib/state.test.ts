// The per-session record the edit hook writes and the stop gate reads: an
// agent's start commit per tree, and the block counter the gate's cap runs
// on. Every test points QSM_LANGDEV_STATE_DIR at a sandbox under the system
// temp directory, removed after each test whether the test passed or failed.

import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearBlocks,
  type Editor,
  editedTrees,
  MAIN_AGENT,
  readStartPoint,
  recordBlock,
  recordStartPoint,
} from "./state.ts";

const sandboxes: string[] = [];
const previousStateDir = process.env.QSM_LANGDEV_STATE_DIR;

function sandbox(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  sandboxes.push(dir);
  return dir;
}

/** The state directory every function under test reads, pointed at a
 * sandbox so no test can see or write the real one. */
function stateSandbox(): void {
  process.env.QSM_LANGDEV_STATE_DIR = sandbox("qsm-langdev-state-");
}

afterEach(() => {
  if (previousStateDir === undefined) {
    delete process.env.QSM_LANGDEV_STATE_DIR;
  } else {
    process.env.QSM_LANGDEV_STATE_DIR = previousStateDir;
  }
  while (sandboxes.length > 0) {
    rmSync(sandboxes.pop() ?? "", { recursive: true, force: true });
  }
});

function git(root: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function repo(): { root: string; head: string } {
  const root = sandbox("qsm-langdev-repo-");
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "qsm test"]);
  writeFileSync(join(root, "a.txt"), "alpha\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "base"]);
  return { root, head: git(root, ["rev-parse", "HEAD"]) };
}

const WORKER: Editor = { sessionId: "session-1", agentId: "worker" };
const GATE = "langdev";

describe("start points", () => {
  test("the first edit fixes the start commit and later edits do not move it", () => {
    stateSandbox();
    const { root, head } = repo();

    recordStartPoint(WORKER, root);
    writeFileSync(join(root, "b.txt"), "beta\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "second"]);
    recordStartPoint(WORKER, root);

    expect(readStartPoint(WORKER, root)).toBe(head);
    expect(editedTrees(WORKER)).toEqual([{ root, start: head }]);
  });

  test("an agent that edited nothing has no tree", () => {
    stateSandbox();
    const { root } = repo();
    recordStartPoint(WORKER, root);

    expect(editedTrees({ sessionId: WORKER.sessionId, agentId: MAIN_AGENT })).toEqual([]);
  });
});

describe("block counts", () => {
  test("the cap counts one regression, and a different one starts over", () => {
    stateSandbox();
    const standing = "langdev: marked: 0 -> 1";
    const other = "structure: 1 new cross-module edge(s)";

    expect(recordBlock(GATE, WORKER, standing)).toBe(1);
    expect(recordBlock(GATE, WORKER, standing)).toBe(2);
    expect(recordBlock(GATE, WORKER, standing)).toBe(3);
    expect(recordBlock(GATE, WORKER, other)).toBe(1);
  });

  test("a clean stop forgets every regression the agent was blocked on", () => {
    stateSandbox();
    const standing = "langdev: marked: 0 -> 1";
    recordBlock(GATE, WORKER, standing);
    recordBlock(GATE, WORKER, standing);

    clearBlocks(GATE, WORKER);

    expect(recordBlock(GATE, WORKER, standing)).toBe(1);
  });

  test("one agent's blocks are not another's", () => {
    stateSandbox();
    const standing = "langdev: marked: 0 -> 1";
    recordBlock(GATE, WORKER, standing);

    expect(recordBlock(GATE, { sessionId: WORKER.sessionId, agentId: "other" }, standing)).toBe(1);
  });
});
