// The classic SubagentStop gate hook, spawned the way the harness spawns it:
// a process fed the event JSON on stdin, judged on its stdout, its stderr and
// its exit. `bun test` ignores plugins/*/hooks/**, so this lives beside the
// CLI test and spawns the hook's own source, never dist/, which may be stale.

import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { findRepoRoot } from "../lib/config.ts";
import { recordStartPoint } from "../lib/state.ts";

const GATE_HOOK = resolve(import.meta.dir, "../hooks/gate-hook.ts");
const GIT = "/usr/bin/git";

const sandboxes: string[] = [];

/** A directory under the system temp directory, removed after each test
 * whether the test passed or failed, with whatever the hook wrote into it. */
function sandbox(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  while (sandboxes.length > 0) {
    rmSync(sandboxes.pop() ?? "", { recursive: true, force: true });
  }
});

function git(root: string, args: string[]): void {
  const r = spawnSync(GIT, args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  }
}

/** Opts `root` into `qsm-langdev init` without running it: the languages
 * a gate-hook test needs gated, and nothing else. */
function initGates(root: string, languages: readonly string[]): void {
  mkdirSync(join(root, ".qsm-langdev"), { recursive: true });
  writeFileSync(
    join(root, ".qsm-langdev", "gates.json"),
    `${JSON.stringify({ hooks: { "pre-commit": [], "pre-push": [] }, languages })}\n`,
  );
}

/** A sandbox git repository with one commit holding one tracked file. */
function repoWithFile(fileName: string, content: string): string {
  const root = sandbox("qsm-langdev-gate-hook-repo-");
  git(root, ["init", "-q"]);
  writeFileSync(join(root, fileName), content);
  git(root, ["add", "-A"]);
  git(root, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "base"]);
  return root;
}

function runHook(hook: string, stateDir: string, stdin: string, env: Record<string, string> = {}) {
  return spawnSync("bun", [hook], {
    encoding: "utf8",
    input: stdin,
    env: { ...process.env, ...env, QSM_LANGDEV_STATE_DIR: stateDir },
  });
}

/** What the edit hook leaves behind: the agent's start point in the edited file's repository. */
function runEditHook(stateDir: string, sessionId: string, agentId: string, filePath: string) {
  process.env.QSM_LANGDEV_STATE_DIR = stateDir;
  try {
    recordStartPoint({ sessionId, agentId }, findRepoRoot(dirname(filePath)) as string);
  } finally {
    delete process.env.QSM_LANGDEV_STATE_DIR;
  }
}

function runGateHook(stateDir: string, sessionId: string, agentId: string) {
  return runHook(GATE_HOOK, stateDir, JSON.stringify({ session_id: sessionId, agent_id: agentId }));
}

describe("qsm-langdev gate hook", () => {
  test("An agent with no recorded edit", () => {
    const stateDir = sandbox("qsm-langdev-gate-hook-state-");

    const r = runGateHook(stateDir, "s1", "a1");

    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("edited no tree");
  });

  test("The stop gate in an un-init'd repository", () => {
    const stateDir = sandbox("qsm-langdev-gate-hook-state-");
    const root = repoWithFile("a.fish", "echo alpha\n");

    // A genuine fish syntax regression — `if` with no matching `end` — but
    // this repository has no .qsm-langdev/gates.json, so nothing here is
    // ours to judge.
    writeFileSync(join(root, "a.fish"), "if true\necho alpha\n");
    runEditHook(stateDir, "s1", "a1", join(root, "a.fish"));

    const r = runGateHook(stateDir, "s1", "a1");

    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("a tree back to its start commit never blocks the stop", () => {
    const stateDir = sandbox("qsm-langdev-gate-hook-state-");
    const root = repoWithFile("notes.txt", "alpha\n");

    // The edited verb records the start point (this commit) while the file
    // still differs from HEAD.
    writeFileSync(join(root, "notes.txt"), "alpha\nedited\n");
    runEditHook(stateDir, "s1", "a1", join(root, "notes.txt"));

    // By the time the agent stops, the edit is undone: the worktree is
    // identical to the recorded start commit, so there is nothing to judge
    // worse.
    git(root, ["checkout", "--", "notes.txt"]);

    const r = runGateHook(stateDir, "s1", "a1");

    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain('"decision":"block"');
  });
});

/** `fish` and `fish_indent` stand-ins in a fresh bin directory: each names
 * a version, and otherwise sleeps far past any budget the test sets. */
function slowFish(): string {
  const bin = sandbox("qsm-langdev-gate-hook-bin-");
  for (const name of ["fish", "fish_indent"]) {
    const path = join(bin, name);
    writeFileSync(
      path,
      '#!/bin/sh\nif [ "$1" = --version ]; then echo "fish, version 4.0.0"; exit 0; fi\nexec sleep 30\n',
    );
    chmodSync(path, 0o755);
  }
  return bin;
}

describe("qsm-langdev gate hook and a checker past its time", () => {
  test("a checker that is not measured warns and never holds the agent", () => {
    const stateDir = sandbox("qsm-langdev-gate-hook-state-");
    const root = repoWithFile("a.fish", "echo alpha\n");
    initGates(root, ["fish"]);
    const bin = slowFish();
    const env = {
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      QSM_LANGDEV_GATE_BUDGET_MS: "500",
    };
    writeFileSync(join(root, "a.fish"), "echo alpha\necho beta\n");
    runEditHook(stateDir, "s1", "a1", join(root, "a.fish"));

    const r = runHook(
      GATE_HOOK,
      stateDir,
      JSON.stringify({ session_id: "s1", agent_id: "a1" }),
      env,
    );

    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain('"decision":"block"');
    expect(r.stderr).toContain("fish-syntax: not measured: timed out after 0.5s");
  }, 60_000);
});
