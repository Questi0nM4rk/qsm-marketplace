// The secrets gate at a push, through git itself: a real `git push` to a local bare remote runs a
// real pre-push hook that runs this plugin's CLI, and the verdict is whether the remote got the ref.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { isolatedEnv } from "../../../lib/fixtures/cli.ts";
import { commit, git } from "../../../lib/fixtures/git.ts";
import { sandboxDir, writeIn } from "../../../lib/fixtures/sandbox.ts";
import { installHooks } from "../lib/git-hooks.ts";

const CLI = resolve(import.meta.dir, "cli.ts");
// Built at run time so this file is not itself a hit for the scan it tests.
const FAKE_KEY = ["AKIA", "QYLPMN5HHHFPZAM2"].join("");

/** A work repository gating `secrets` at a push, a bare remote `origin`, and the pre-push hook
 * `install` writes, which finds the CLI as `qsm-langdev` on PATH like the installed one. */
function pushSetup(): { work: string; bin: string; home: string } {
  const home = sandboxDir("qsm-langdev-push-secrets-");
  const work = join(home, "work");
  const remote = join(home, "remote.git");
  const bin = join(home, "bin");
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
  mkdirSync(bin);
  writeFileSync(
    join(bin, "qsm-langdev"),
    `#!/usr/bin/env bash\nexec ${process.execPath} ${CLI} "$@"\n`,
  );
  chmodSync(join(bin, "qsm-langdev"), 0o755);
  installHooks(work, ["pre-push"]);
  return { work, bin, home };
}

/** `git push <remote> <refspec>`, with extra git arguments before `push`'s own. */
function pushTo(
  { work, bin, home }: ReturnType<typeof pushSetup>,
  remote: string,
  refspec: string[],
  ...flags: string[]
) {
  const r = spawnSync("git", ["-C", work, "push", "-q", ...flags, remote, ...refspec], {
    encoding: "utf8",
    env: isolatedEnv(home, {
      GIT_CONFIG_GLOBAL: "/dev/null",
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
    }),
  });
  return { exit: r.status ?? 1, stderr: r.stderr };
}

const push = (setup: ReturnType<typeof pushSetup>, ...refspec: string[]) =>
  pushTo(setup, "origin", refspec);

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
    expect(existing.stderr).not.toContain("(commit");
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

  test("a force push over a remote tip this clone never fetched is refused, the remote unmoved", () => {
    const setup = pushSetup();
    const { work, home } = setup;
    const remote = join(home, "remote.git");
    expect(push(setup, "main").exit).toBe(0);

    // Someone else moves the remote; this clone never fetches that commit.
    const other = join(home, "other");
    git(home, "clone", "-q", "-b", "main", remote, other);
    writeIn(other, "theirs.txt", "theirs\n");
    commit(other, "theirs");
    git(other, "push", "-q", "origin", "main");
    const tip = git(home, "-C", remote, "rev-parse", "main");

    writeIn(work, "config.txt", `aws_key = "${FAKE_KEY}"\n`);
    commit(work, "add config");
    const forced = push(setup, "+main");
    expect(forced.exit).not.toBe(0);
    expect(forced.stderr).toContain("never fetched");
    expect(forced.stderr).toContain("git fetch");
    expect(git(home, "-C", remote, "rev-parse", "main")).toBe(tip);
  }, 60_000);

  test("a secret commit only another remote holds is refused when pushed as a new branch to this one", () => {
    const setup = pushSetup();
    const { work, home } = setup;
    git(home, "init", "-q", "--bare", join(home, "backup.git"));
    git(home, "init", "-q", "--bare", join(home, "public.git"));
    git(work, "remote", "add", "backup", join(home, "backup.git"));
    git(work, "remote", "add", "public", join(home, "public.git"));

    // The secret reaches backup past the gate, so refs/remotes/backup/leak holds the commit.
    git(work, "checkout", "-q", "-b", "leak");
    writeIn(work, "config.txt", `aws_key = "${FAKE_KEY}"\n`);
    commit(work, "add config");
    expect(pushTo(setup, "backup", ["leak"], "--no-verify").exit).toBe(0);
    expect(git(work, "rev-parse", "refs/remotes/backup/leak")).toBe(git(work, "rev-parse", "leak"));

    const toPublic = pushTo(setup, "public", ["leak"]);
    expect(toPublic.exit).not.toBe(0);
    expect(toPublic.stderr).toContain("rule aws-access-token hit in config.txt:1");
    expect(git(home, "-C", join(home, "public.git"), "branch", "--list", "leak")).toBe("");
  }, 60_000);

  test("a hook installed before the remote name was passed blocks loud until install runs again", () => {
    const setup = pushSetup();
    const { work, home } = setup;
    const hook = join(work, ".git", "hooks", "pre-push");
    writeFileSync(
      hook,
      "#!/usr/bin/env bash\n# installed by qsm-langdev\nset -euo pipefail\n\nqsm-langdev hook pre-push || exit 1\n",
    );

    const stale = push(setup, "main");
    expect(stale.exit).not.toBe(0);
    expect(stale.stderr).toContain("did not say which remote");
    expect(stale.stderr).toContain("qsm-langdev install");
    expect(git(home, "-C", join(home, "remote.git"), "branch", "--list", "main")).toBe("");

    expect(installHooks(work, ["pre-push"])[0]?.kind).toBe("written");
    expect(push(setup, "main").exit).toBe(0);
  }, 60_000);
});
