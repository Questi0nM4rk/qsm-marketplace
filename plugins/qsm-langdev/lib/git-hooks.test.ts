// Installing beside a hook the repository already has, and taking out
// exactly what was put in. Every repository is a sandbox under the system
// temp directory, removed after each test whether the test passed or
// failed.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { installHooks, uninstallHooks } from "./git-hooks.ts";

function repo(): string {
  const root = sandboxDir("qsm-langdev-hooks-");
  const init = spawnSync("git", ["init", "-q", "-b", "main"], { cwd: root, encoding: "utf8" });
  if (init.status !== 0) {
    throw new Error(`git init failed: ${init.stderr}`);
  }
  return root;
}

function hookPath(root: string, name: string): string {
  return join(root, ".git", "hooks", name);
}

const THEIRS = "#!/usr/bin/env bash\nset -e\necho their own check\n";

describe("installHooks", () => {
  test("writes the hook whole where the repository has none", () => {
    const root = repo();

    const actions = installHooks(root, ["pre-commit"]);

    expect(actions[0]?.kind).toBe("written");
    expect(readFileSync(hookPath(root, "pre-commit"), "utf8")).toContain(
      "qsm-langdev hook pre-commit",
    );
  });

  test("Installing beside an existing hook", () => {
    const root = repo();
    writeFileSync(hookPath(root, "pre-commit"), THEIRS, { mode: 0o755 });

    const actions = installHooks(root, ["pre-commit"]);

    expect(actions[0]?.kind).toBe("appended");
    const body = readFileSync(hookPath(root, "pre-commit"), "utf8");
    expect(body).toContain("echo their own check");
    expect(body).toContain("qsm-langdev gate (added by qsm-langdev install)");
    expect(readFileSync(`${hookPath(root, "pre-commit")}.qsm-backup`, "utf8")).toBe(THEIRS);
  });

  test("a second install adds nothing further", () => {
    const root = repo();
    writeFileSync(hookPath(root, "pre-commit"), THEIRS, { mode: 0o755 });
    installHooks(root, ["pre-commit"]);
    const afterFirst = readFileSync(hookPath(root, "pre-commit"), "utf8");

    const actions = installHooks(root, ["pre-commit"]);

    expect(actions[0]?.kind).toBe("already");
    expect(readFileSync(hookPath(root, "pre-commit"), "utf8")).toBe(afterFirst);
  });
});

describe("a block written before the remote name was passed", () => {
  test("install rewrites it to the current call once, beside the repository's own hook", () => {
    const root = repo();
    writeFileSync(hookPath(root, "pre-push"), THEIRS, { mode: 0o755 });
    installHooks(root, ["pre-push"]);
    const current = readFileSync(hookPath(root, "pre-push"), "utf8");
    expect(current).toContain('qsm-langdev hook pre-push "${1:-}" || exit 1');
    const stale = current.replace(' "${1:-}"', "");
    writeFileSync(hookPath(root, "pre-push"), stale, { mode: 0o755 });

    expect(installHooks(root, ["pre-push"])[0]?.kind).toBe("appended");
    expect(readFileSync(hookPath(root, "pre-push"), "utf8")).toBe(current);
    expect(installHooks(root, ["pre-push"])[0]?.kind).toBe("already");
  });
});

describe("uninstallHooks", () => {
  test("Uninstall restores the prior hook", () => {
    const root = repo();
    writeFileSync(hookPath(root, "pre-commit"), THEIRS, { mode: 0o755 });
    installHooks(root, ["pre-commit"]);

    const actions = uninstallHooks(root, ["pre-commit"]);

    expect(actions[0]?.kind).toBe("unappended");
    expect(readFileSync(hookPath(root, "pre-commit"), "utf8")).toBe(THEIRS);
  });

  test("removes a hook it wrote whole", () => {
    const root = repo();
    installHooks(root, ["pre-commit"]);

    const actions = uninstallHooks(root, ["pre-commit"]);

    expect(actions[0]?.kind).toBe("removed");
    expect(existsSync(hookPath(root, "pre-commit"))).toBe(false);
  });

  test("leaves a hook it never touched alone", () => {
    const root = repo();
    writeFileSync(hookPath(root, "pre-commit"), THEIRS, { mode: 0o755 });

    const actions = uninstallHooks(root, ["pre-commit"]);

    expect(actions[0]?.kind).toBe("absent");
    expect(readFileSync(hookPath(root, "pre-commit"), "utf8")).toBe(THEIRS);
  });
});
