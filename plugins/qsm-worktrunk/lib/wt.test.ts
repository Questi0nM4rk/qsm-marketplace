import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import {
  createWorkspace,
  createWorkspaceArgv,
  markerArgv,
  meetsMinimum,
  parseVersion,
  parseWorktreeList,
  type Runner,
  removeWorkspace,
  removeWorkspaceArgv,
  setMarker,
  supportsWorkspaceCreate,
  WtError,
  worktreeBranchOf,
  worktreePathOf,
  wtPath,
  wtVersion,
} from "./wt.ts";

async function rejection(promise: Promise<unknown>): Promise<Error | undefined> {
  try {
    await promise;
  } catch (error: unknown) {
    return error instanceof Error ? error : undefined;
  }
  return undefined;
}

const PORCELAIN = [
  "worktree /repo",
  "HEAD 1111111111111111111111111111111111111111",
  "branch refs/heads/main",
  "",
  "worktree /repo/.claude/worktrees/feature",
  "HEAD 2222222222222222222222222222222222222222",
  "branch refs/heads/feature",
  "",
  "worktree /repo/.claude/worktrees/loose",
  "HEAD 3333333333333333333333333333333333333333",
  "detached",
  "",
].join("\n");

/** spawnSync's answer as the Runner's shape; a process that never started is exit 1. */
function resultOf(r: { status: number | null; stdout: string | null; stderr: string | null }) {
  return { exitCode: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** A sandbox holding a `wt` and a `git` that record the argument vectors they
 * are called with, so what the plugin asks of the real binaries is visible as
 * text. The fake wt behaves like 0.22.0: `switch` prints a human line on
 * stderr and nothing on stdout; `git worktree list --porcelain` answers the
 * stanzas above; `git symbolic-ref` answers main.
 *
 * `switchHelp` is what its `wt switch --help` prints: the default lists the
 * flags the create path needs, and a caller passing an older help gets a
 * binary that answers every other question and still cannot create. */
function fakeWt(switchHelp = "Options:\n  -c, --create\n  -b, --base <BASE>\n"): {
  run: Runner;
  calls: () => string[];
  dir: string;
} {
  const dir = sandboxDir("qsm-worktrunk-");
  const log = join(dir, "calls.log");
  writeFileSync(
    join(dir, "wt"),
    [
      "#!/usr/bin/env bash",
      `printf 'wt %s\\n' "$*" >> ${JSON.stringify(log)}`,
      `if [ "$1" = "switch" ] && [ "$2" = "--help" ]; then printf '%s' ${JSON.stringify(switchHelp)}; exit 0; fi`,
      'if [ "$1" = "switch" ]; then printf \'✓ Created branch %s and worktree @ /repo/.claude/worktrees/%s\\n\' "$3" "$3" >&2; fi',
      'if [ "$1" = "--version" ]; then printf \'wt 0.22.0\\n\'; fi',
      "exit 0",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, "git"),
    [
      "#!/usr/bin/env bash",
      `printf 'git %s\\n' "$*" >> ${JSON.stringify(log)}`,
      `if [ "$1" = "worktree" ]; then printf '%b\\n' ${JSON.stringify(PORCELAIN)}; exit 0; fi`,
      'if [ "$1" = "symbolic-ref" ]; then printf \'main\\n\'; exit 0; fi',
      "exit 0",
    ].join("\n"),
  );
  chmodSync(join(dir, "wt"), 0o755);
  chmodSync(join(dir, "git"), 0o755);
  const run: Runner = (argv, cwd) => {
    const [command, ...args] = argv;
    const result = spawnSync(command ?? "", args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ""}` },
    });
    return Promise.resolve(resultOf(result));
  };
  const calls = (): string[] => {
    try {
      return readFileSync(log, "utf8").trim().split("\n");
    } catch {
      return [];
    }
  };
  return { run, calls, dir };
}

describe("markerArgv", () => {
  test("working and waiting each set their own glyph, cleared clears", () => {
    expect(markerArgv("working").slice(0, 5)).toEqual(["wt", "config", "state", "marker", "set"]);
    expect(markerArgv("waiting").slice(0, 5)).toEqual(["wt", "config", "state", "marker", "set"]);
    expect(markerArgv("working")[5]).not.toBe(markerArgv("waiting")[5] ?? "");
    expect(markerArgv("cleared")).toEqual(["wt", "config", "state", "marker", "clear"]);
  });
});

describe("createWorkspaceArgv", () => {
  test("creates by branch name off the caller's branch, never asks wt for a format or a cd", () => {
    expect(createWorkspaceArgv("feature", "main")).toEqual([
      "wt",
      "switch",
      "--create",
      "feature",
      "--base",
      "main",
    ]);
    expect(createWorkspaceArgv("feature", null)).toEqual(["wt", "switch", "--create", "feature"]);
  });
});

describe("removeWorkspaceArgv", () => {
  test("A workspace is torn down", () => {
    expect(removeWorkspaceArgv("feature")).toEqual(["wt", "remove", "--foreground", "feature"]);
  });
});

describe("git worktree list --porcelain", () => {
  const list = parseWorktreeList(PORCELAIN);

  test("one entry per stanza, detached ones without a branch", () => {
    expect(list).toEqual([
      { path: "/repo", branch: "main" },
      { path: "/repo/.claude/worktrees/feature", branch: "feature" },
      { path: "/repo/.claude/worktrees/loose", branch: null },
    ]);
  });

  test("path by branch and branch by path, trailing slashes ignored", () => {
    expect(worktreePathOf(list, "feature")).toBe("/repo/.claude/worktrees/feature");
    expect(worktreePathOf(list, "nope")).toBeNull();
    expect(worktreeBranchOf(list, "/repo/.claude/worktrees/feature/")).toBe("feature");
    expect(worktreeBranchOf(list, "/repo/.claude/worktrees/loose")).toBeNull();
  });
});

describe("version floor", () => {
  test("parses the number out of the line wt prints", () => {
    expect(parseVersion("wt 0.22.0")).toEqual([0, 22, 0]);
    expect(parseVersion("worktrunk 1.2")).toEqual([1, 2, 0]);
    expect(parseVersion("no number")).toBeNull();
  });

  test("0.22.0 is the floor", () => {
    expect(meetsMinimum("wt 0.22.0")).toBe(true);
    expect(meetsMinimum("wt 0.23.1")).toBe(true);
    expect(meetsMinimum("wt 1.0.0")).toBe(true);
    expect(meetsMinimum("wt 0.21.9")).toBe(false);
    expect(meetsMinimum("wt 0.5.4")).toBe(false);
    expect(meetsMinimum("garbage")).toBe(false);
  });
});

describe("against a wt on PATH", () => {
  test("the marker writer sets and clears through wt", async () => {
    const { run, calls } = fakeWt();
    expect(await setMarker(run, "working")).toBe(true);
    expect(await setMarker(run, "waiting")).toBe(true);
    expect(await setMarker(run, "cleared")).toBe(true);
    const recorded = calls();
    expect(recorded).toHaveLength(3);
    expect(recorded[0]).toStartWith("wt config state marker set ");
    expect(recorded[1]).toStartWith("wt config state marker set ");
    expect(recorded[0]).not.toBe(recorded[1] ?? "");
    expect(recorded[2]).toBe("wt config state marker clear");
  });

  test("A workspace is requested for a branch name", async () => {
    const { run, calls } = fakeWt();
    expect(await createWorkspace(run, "feature")).toBe("/repo/.claude/worktrees/feature");
    expect(calls()).toEqual([
      "git symbolic-ref --short HEAD",
      "wt switch --create feature --base main",
      "git worktree list --porcelain",
    ]);
  });

  test("wt exits 0 but git lists no worktree on the branch: a WtError naming the branch", async () => {
    const { run } = fakeWt();
    const error = await rejection(createWorkspace(run, "ghost"));
    expect(error?.message).toContain("wt exited 0 but git lists no worktree on branch ghost");
  });

  test("removing a workspace resolves its branch from git and passes the branch to wt", async () => {
    const { run, calls } = fakeWt();
    await removeWorkspace(run, "/repo/.claude/worktrees/feature");
    expect(calls()).toEqual(["git worktree list --porcelain", "wt remove --foreground feature"]);
  });

  test("removing a path git does not list is a WtError", async () => {
    const { run } = fakeWt();
    const error = await rejection(removeWorkspace(run, "/elsewhere"));
    expect(error?.message).toContain("no worktree with a branch at /elsewhere");
  });
});

describe("against a wt on PATH, the doctor's probes", () => {
  test("the version check reads the version wt prints", async () => {
    const { run } = fakeWt();
    expect(await wtVersion(run)).toBe("wt 0.22.0");
  });

  test("a build that prints its version on standard error still counts", async () => {
    const onStderr: Runner = () =>
      Promise.resolve({ exitCode: 0, stdout: "", stderr: "wt 0.22.0\n" });
    expect(await wtVersion(onStderr)).toBe("wt 0.22.0");
  });

  test("the create check reads the flags out of wt's own help for switch", async () => {
    const { run, calls } = fakeWt();
    expect(await supportsWorkspaceCreate(run)).toBe(true);
    expect(calls()[0]).toBe("wt switch --help");
  });

  test("a switch help missing either flag cannot create, whatever version it reports", async () => {
    expect(
      await supportsWorkspaceCreate(fakeWt("Options:\n  --no-cd\n  --format <FORMAT>\n").run),
    ).toBe(false);
    expect(await supportsWorkspaceCreate(fakeWt("Options:\n  --create\n").run)).toBe(false);
    expect(await supportsWorkspaceCreate(fakeWt("Options:\n  --base <BASE>\n").run)).toBe(false);
  });

  test("the path check names the wt PATH resolved to", async () => {
    const { run, dir } = fakeWt();
    expect(await wtPath(run)).toBe(join(dir, "wt"));
  });
});

describe("with no wt on PATH", () => {
  const missing: Runner = () => Promise.resolve({ exitCode: 127, stdout: "", stderr: "not found" });

  test("the version check answers null, the marker answers false, create and remove throw a WtError with the exit", async () => {
    expect(await wtVersion(missing)).toBeNull();
    expect(await setMarker(missing, "working")).toBe(false);
    const created = await rejection(createWorkspace(missing, "feature"));
    expect(created).toBeInstanceOf(WtError);
    expect(created?.message).toContain("exit 127: not found");
    expect(await rejection(removeWorkspace(missing, "/workspaces/feature"))).toBeInstanceOf(
      WtError,
    );
  });

  test("a runner that rejects is still no version, not a crash", async () => {
    const throwing: Runner = () => Promise.reject(new Error("cannot start"));
    expect(await wtVersion(throwing)).toBeNull();
  });
});

const REAL_WT = spawnSync("sh", ["-c", "command -v wt"], { encoding: "utf8" }).status === 0;

/** A fresh repository with one commit and a worktrunk config that puts
 * workspaces under <repo>/.wt, with HOME and XDG dirs inside the sandbox so
 * the real wt never touches this machine's state. */
function throwawayRepo(): { repo: string; run: Runner; env: NodeJS.ProcessEnv } {
  const home = sandboxDir("qsm-worktrunk-");
  const repo = join(home, "repo");
  mkdirSync(join(home, "config", "worktrunk"), { recursive: true });
  writeFileSync(
    join(home, "config", "worktrunk", "config.toml"),
    'worktree-path = "{{ repo_path }}/.wt/{{ branch | sanitize }}"\n',
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_STATE_HOME: join(home, "state"),
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.com",
  };
  execFileSync("git", ["init", "-q", "-b", "main", repo], { env });
  writeFileSync(join(repo, "a.txt"), "a\n");
  execFileSync("git", ["add", "a.txt"], { cwd: repo, env });
  execFileSync("git", ["commit", "-q", "-m", "one"], { cwd: repo, env });
  const run: Runner = (argv, cwd) => {
    const [command, ...args] = argv;
    return Promise.resolve(
      resultOf(spawnSync(command ?? "", args, { cwd: cwd ?? repo, encoding: "utf8", env })),
    );
  };
  return { repo, run, env };
}

describe.skipIf(!REAL_WT)("against the real wt, in a throwaway repository", () => {
  test("create puts the worktree where git lists it, remove takes the worktree and a merged branch away", async () => {
    const { repo, run, env } = throwawayRepo();
    const git = (args: string[]) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8" });

    const path = await createWorkspace(run, "feature-x", repo);
    expect(path).toBe(join(repo, ".wt", "feature-x"));
    expect(existsSync(join(path, "a.txt"))).toBe(true);
    expect(git(["worktree", "list", "--porcelain"])).toContain("branch refs/heads/feature-x");

    await removeWorkspace(run, path, repo);
    expect(existsSync(path)).toBe(false);
    expect(git(["branch", "--list", "feature-x"]).trim()).toBe("");
  }, 60_000);
});
