// The secrets gate at a push, through git itself: a real `git push` to a local bare remote runs a
// real pre-push hook that runs this plugin's CLI, and the verdict is whether the remote got the ref.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isolatedEnv } from "../../../lib/fixtures/cli.ts";
import { commit, git } from "../../../lib/fixtures/git.ts";
import { sandboxDir, writeIn } from "../../../lib/fixtures/sandbox.ts";

const CLI = resolve(import.meta.dir, "cli.ts");
// Built at run time so this file is not itself a hit for the scan it tests.
const FAKE_KEY = ["AKIA", "QYLPMN5HHHFPZAM2"].join("");

/** A work repository gating `secrets` at a push, a bare remote it has pushed `main` to, and the
 * hook that runs the CLI the way the installed one does. */
function pushSetup(): { work: string; hooks: string; home: string } {
  const home = sandboxDir("qsm-langdev-push-secrets-");
  const work = join(home, "work");
  const remote = join(home, "remote.git");
  const hooks = join(home, "hooks");
  git(home, "init", "-q", "--bare", remote);
  git(home, "init", "-q", "-b", "main", work);
  git(work, "remote", "add", "origin", remote);
  writeIn(work, ".gitleaks.toml", "[extend]\nuseDefault = true\n");
  writeIn(
    work,
    ".qsm-langdev/gates.json",
    `${JSON.stringify({ hooks: { "pre-commit": [], "pre-push": ["secrets"] }, languages: [] })}\n`,
  );
  writeIn(work, "readme.txt", "hello\n");
  commit(work, "base");
  mkdirSync(hooks);
  writeFileSync(
    join(hooks, "pre-push"),
    `#!/usr/bin/env bash\nexec ${process.execPath} ${CLI} hook pre-push\n`,
  );
  chmodSync(join(hooks, "pre-push"), 0o755);
  return { work, hooks, home };
}

function push({ work, hooks, home }: ReturnType<typeof pushSetup>, ...refspec: string[]) {
  const r = spawnSync(
    "git",
    ["-C", work, "-c", `core.hooksPath=${hooks}`, "push", "-q", "origin", ...refspec],
    { encoding: "utf8", env: isolatedEnv(home, { GIT_CONFIG_GLOBAL: "/dev/null" }) },
  );
  return { exit: r.status ?? 1, stderr: r.stderr };
}

describe("qsm-langdev secrets gate at a push", () => {
  test("a clean commit passes, a pushed secret is refused on an existing and on a new branch", () => {
    const setup = pushSetup();
    const { work, home } = setup;
    // The first push has no remote ref at all: a new branch, scanned as the commits no remote has.
    expect(push(setup, "main").exit).toBe(0);

    writeIn(work, "config.txt", `aws_key = "${FAKE_KEY}"\n`);
    commit(work, "add config");
    const existing = push(setup, "main");
    expect(existing.exit).not.toBe(0);
    expect(existing.stderr).toContain("pushed commits carry a secret");
    expect(existing.stderr).toContain("rule aws-access-token hit in config.txt:1");
    expect(existing.stderr).not.toContain(FAKE_KEY);
    expect(git(home, "-C", join(home, "remote.git"), "rev-parse", "main")).not.toBe(
      git(work, "rev-parse", "main"),
    );

    git(work, "checkout", "-q", "-b", "feature");
    const fresh = push(setup, "feature");
    expect(fresh.exit).not.toBe(0);
    expect(fresh.stderr).toContain("rule aws-access-token hit in config.txt:1");

    git(work, "reset", "-q", "--hard", "origin/main");
    writeIn(work, "notes.txt", "nothing here\n");
    commit(work, "clean");
    expect(push(setup, "feature").exit).toBe(0);
  }, 60_000);
});
