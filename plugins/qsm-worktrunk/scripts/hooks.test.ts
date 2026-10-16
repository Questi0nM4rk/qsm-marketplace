// The three classic command hooks, spawned the way the harness spawns them: a
// process fed the event JSON on stdin, judged on its stdout and its exit.
// `bun test` ignores plugins/*/hooks/**, so this lives beside install.test.ts
// and spawns each hook's source directly, never dist/, which may be stale.
//
// Every test gets its own sandbox: a real git repository with one commit on
// `main`, and a `HOME` of its own so `wt`'s config and state live beside the
// sandbox rather than the operator's. `wt` is a real binary here, not a
// stub: it is what proves the hook against, not what the hook is proved to
// answer well.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bareRuntimePath } from "../../../lib/fixtures/bin.ts";
import { isolatedEnv, runBin } from "../../../lib/fixtures/cli.ts";
import { git, repoWith } from "../../../lib/fixtures/git.ts";

const HOOKS = resolve(import.meta.dir, "../hooks");

interface Sandbox {
  readonly repo: string;
  readonly env: Record<string, string>;
}

/** A real git repository with one commit on `main`, and a `HOME` of its own. */
function sandbox(): Sandbox {
  const { root, repo } = repoWith("qsm-worktrunk-hooks-", { "README.md": "hello\n" });
  git(repo, "branch", "-M", "main");
  return { repo, env: isolatedEnv(root) };
}

/** `wt switch --create <branch> --base main`, for the tests that need an
 * existing workspace before they spawn the hook under test. */
function createBranch(s: Sandbox, branch: string): void {
  const r = spawnSync("wt", ["switch", "--create", branch, "--base", "main"], {
    cwd: s.repo,
    env: s.env,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`wt switch --create ${branch} failed: ${r.stderr}`);
  }
}

function runHook(name: string, s: Sandbox, cwd: string, event: Record<string, unknown>) {
  return runBin(join(HOOKS, `${name}.ts`), [], {
    cwd,
    env: s.env,
    input: JSON.stringify({ session_id: "s1", transcript_path: "/tmp/t", cwd, ...event }),
  });
}

describe("worktree-create", () => {
  test("prints the absolute path git lists and writes .beads/redirect", () => {
    const s = sandbox();
    mkdirSync(join(s.repo, ".beads"), { recursive: true });
    writeFileSync(join(s.repo, ".beads", "marker"), "main checkout's store\n");

    const r = runHook("worktree-create", s, s.repo, { name: "feature" });

    expect(r.exit).toBe(0);
    // A command hook answers WorktreeCreate with the bare path on stdout.
    const path = r.stdout.trim();
    expect(path.startsWith("/")).toBe(true);
    expect(git(s.repo, "worktree", "list", "--porcelain")).toContain(`worktree ${path}`);
    expect(readFileSync(join(path, ".beads", "redirect"), "utf8").trim()).toBe(
      join(s.repo, ".beads"),
    );
  });

  test("wt refuses", () => {
    const s = sandbox();

    const r = runHook("worktree-create", s, s.repo, { name: "main" });

    expect(r.exit).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("qsm-worktrunk:");
    expect(r.stderr).toContain("Run /qsm-worktrunk.");
  });
});

describe("worktree-create without wt", () => {
  test("exits 1 and names the plugin on stderr", () => {
    const s = sandbox();

    const r = runHook(
      "worktree-create",
      { ...s, env: { ...s.env, PATH: bareRuntimePath() } },
      s.repo,
      {
        name: "feature",
      },
    );

    expect(r.exit).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("qsm-worktrunk:");
  });
});

describe("worktree-remove", () => {
  test("removes the workspace", () => {
    const s = sandbox();
    createBranch(s, "feature");
    const path = `${s.repo}.feature`;

    const r = runHook("worktree-remove", s, s.repo, { worktree_path: path });

    expect(r.exit).toBe(0);
    expect(existsSync(path)).toBe(false);
  });
});

describe("notification-marker", () => {
  test("The agent needs the user's attention", () => {
    const s = sandbox();
    const r = runHook("notification-marker", s, s.repo, {
      message: "waiting on you",
      notification_type: "idle",
    });
    expect(r.exit).toBe(0);
  });
});
