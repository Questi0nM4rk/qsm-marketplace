// The foreground build, in throwaway git repositories, with graphify and semble faked through
// the runner so the degrade paths are proved without a Python toolchain in the room. git is
// real. Every sandbox (repository and cache) is removed after each test whether the test passed
// or failed.

import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { type BuildDeps, buildIndex, IndexPathError } from "./build.ts";
import { cacheFiles } from "./paths.ts";
import { changedSet } from "./repo.ts";
import { spawnRunner } from "./run.ts";
import { type BuildStatus, readStatus } from "./state.ts";
import { commit, fakeRunner, git, removeSandboxes, repoWithCache, sandbox } from "./test-repo.ts";

afterEach(removeSandboxes);

function scenario() {
  const made = repoWithCache("qsm-index-build-");
  return { ...made, files: cacheFiles(made.repo, { QSM_INDEX_CACHE_DIR: made.cache }) };
}

function deps(runner: ReturnType<typeof fakeRunner>, cache: string): BuildDeps {
  return { cwd: "/", run: runner.run, env: { QSM_INDEX_CACHE_DIR: cache } };
}

function statusOf(file: string): BuildStatus {
  const status = readStatus(file);
  if (status === null) {
    throw new Error(`no readable status at ${file}`);
  }
  return status;
}

describe("Index a local path", () => {
  test("Normal indexing pass", () => {
    const { repo, cache, files } = scenario();
    const runner = fakeRunner();

    const report = buildIndex(join(repo, "src"), deps(runner, cache));

    expect(runner.calls).toEqual(["graphify", "semble"]);
    expect(report).toMatchObject({
      kind: "built",
      repo,
      result: "ok",
      built_at_commit: git(repo, "rev-parse", "HEAD"),
      graph_path: join(repo, "graphify-out", "graph.json"),
    });
    expect(statusOf(files.status)).toMatchObject({
      repo,
      state: "done",
      result: "ok",
      cause: null,
      built_at_commit: git(repo, "rev-parse", "HEAD"),
    });
    expect(existsSync(files.lock)).toBe(false);
  });

  test("the status file records the changed set the build started from", () => {
    const { repo, cache, files } = scenario();
    writeFileSync(join(repo, "src", "a.ts"), "export const a = 2;\n");
    writeFileSync(join(repo, "new.ts"), "x\n");

    buildIndex(repo, deps(fakeRunner(), cache));

    expect(Object.keys(statusOf(files.status).changed_at_build).sort()).toEqual([
      "new.ts",
      "src/a.ts",
    ]);
  });

  test("Path is not an indexable directory", () => {
    const { root, repo, cache } = scenario();
    const runner = fakeRunner();
    const missing = join(repo, "nope");
    expect(() => buildIndex(missing, deps(runner, cache))).toThrow(
      new IndexPathError(`path does not exist: ${missing}`),
    );
    const file = join(repo, "src", "a.ts");
    expect(() => buildIndex(file, deps(runner, cache))).toThrow(
      new IndexPathError(`path is not a directory: ${file}`),
    );
    const plain = join(root, "plain");
    mkdirSync(plain);
    expect(() => buildIndex(plain, deps(runner, cache))).toThrow(IndexPathError);
    expect(runner.calls).toEqual([]);
    expect(existsSync(cache)).toBe(false);
  });
});

describe("A missing dependency degrades the index, it does not fail it", () => {
  test("Structural graph tool unavailable", () => {
    const { repo, cache, files } = scenario();
    const runner = fakeRunner({ graphify: "graphify is not available: ENOENT" });

    const report = buildIndex(repo, deps(runner, cache));

    expect(report).toMatchObject({ kind: "built", result: "failed", graph_path: null });
    expect(statusOf(files.status)).toMatchObject({
      state: "done",
      result: "failed",
      cause: "graphify is not available: ENOENT",
    });
    expect(existsSync(files.lock)).toBe(false);
  });

  test("Semantic tool unavailable", () => {
    const { repo, cache, files } = scenario();

    const report = buildIndex(repo, deps(fakeRunner({ semble: "semble exited 127" }), cache));

    expect(report).toMatchObject({ kind: "built", result: "partial" });
    expect(statusOf(files.status)).toMatchObject({ result: "partial", cause: "semble exited 127" });
    expect(existsSync(join(repo, "graphify-out", "graph.json"))).toBe(true);
    expect(existsSync(files.lock)).toBe(false);
  });
});

describe("A refresh never blocks and reports how far it is", () => {
  test("a build while a live build holds the lock runs nothing", () => {
    const { repo, cache, files } = scenario();
    mkdirSync(files.dir, { recursive: true });
    const held = { pid: process.pid, started_at: "2026-10-01T10:00:00.000Z" };
    writeFileSync(files.lock, JSON.stringify(held));
    const runner = fakeRunner();

    const report = buildIndex(repo, deps(runner, cache));

    expect(report).toEqual({ kind: "running", repo, started_at: held.started_at });
    expect(runner.calls).toEqual([]);
    expect(JSON.parse(readFileSync(files.lock, "utf8"))).toEqual(held);
  });

  test("a build takes over a lock whose process is dead", () => {
    const { repo, cache, files } = scenario();
    mkdirSync(files.dir, { recursive: true });
    const dead = spawnSync("true").pid;
    writeFileSync(
      files.lock,
      JSON.stringify({ pid: dead, started_at: "2026-01-01T00:00:00.000Z" }),
    );

    const report = buildIndex(repo, deps(fakeRunner(), cache));

    expect(report).toMatchObject({ kind: "built", result: "ok" });
    expect(existsSync(files.lock)).toBe(false);
  });
});

describe("The dropped surfaces are gone", () => {
  test("a build writes no INDEX.md", () => {
    const { root, repo, cache } = scenario();

    buildIndex(repo, deps(fakeRunner(), cache));

    const written = readdirSync(root, { recursive: true }).map(String);
    expect(written.filter((p) => p.endsWith("INDEX.md") || p.endsWith("NOTES.md"))).toEqual([]);
  });
});

describe("Indexing leaves nothing in the repository that would be committed", () => {
  test("a build leaves git status unchanged", () => {
    const { repo, cache } = scenario();

    buildIndex(repo, deps(fakeRunner(), cache));

    expect(git(repo, "status", "--porcelain", "-uall")).toBe("");
  });

  test("a build makes graphify-out a symlink into the cache", () => {
    const { repo, cache, files } = scenario();

    buildIndex(repo, deps(fakeRunner(), cache));

    const target = join(files.dir, "graphify-out");
    expect(readlinkSync(join(repo, "graphify-out"))).toBe(target);
    expect(existsSync(join(target, "graph.json"))).toBe(true);
  });

  test("a build appends graphify-out to the exclude file once", () => {
    const { repo, cache } = scenario();

    buildIndex(repo, deps(fakeRunner(), cache));
    buildIndex(repo, deps(fakeRunner(), cache));

    const exclude = resolve(repo, git(repo, "rev-parse", "--git-path", "info/exclude"));
    const lines = readFileSync(exclude, "utf8").split("\n");
    expect(lines.filter((line) => line === "graphify-out")).toHaveLength(1);
  });

  test("a build in a worktree writes the exclude file git names", () => {
    const { root, repo, cache } = scenario();
    const tree = join(root, "tree");
    git(repo, "worktree", "add", "-q", "-b", "side", tree);

    buildIndex(tree, deps(fakeRunner(), cache));

    const exclude = resolve(tree, git(tree, "rev-parse", "--git-path", "info/exclude"));
    expect(readFileSync(exclude, "utf8").split("\n")).toContain("graphify-out");
    expect(git(tree, "status", "--porcelain", "-uall")).toBe("");
  });

  test("a path outside any git repository gets no symlink", () => {
    const { root, cache } = scenario();
    const plain = join(root, "plain");
    mkdirSync(plain);

    expect(() => buildIndex(plain, deps(fakeRunner(), cache))).toThrow(IndexPathError);
    expect(existsSync(join(plain, "graphify-out"))).toBe(false);
  });
});

describe("An existing graphify-out", () => {
  test("a real graphify-out directory is left alone", () => {
    const { repo, cache, files } = scenario();
    mkdirSync(join(repo, "graphify-out"));

    buildIndex(repo, deps(fakeRunner(), cache));

    expect(lstatSync(join(repo, "graphify-out")).isDirectory()).toBe(true);
    expect(existsSync(join(repo, "graphify-out", "graph.json"))).toBe(true);
    expect(existsSync(join(files.dir, "graphify-out", "graph.json"))).toBe(false);
    expect(git(repo, "status", "--porcelain", "-uall")).toBe("");
  });

  test("a tracked graph the build rewrites is no change to the source", () => {
    const { repo, cache } = scenario();
    mkdirSync(join(repo, "graphify-out"));
    writeFileSync(join(repo, "graphify-out", "graph.json"), '{"old":1}');
    git(repo, "add", "-f", "graphify-out/graph.json");
    commit(repo, "graph");

    buildIndex(repo, deps(fakeRunner(), cache));

    expect(changedSet(repo, spawnRunner)).toEqual({});
  });

  test("a symlink pointing outside the cache is left alone with a warning", () => {
    const { root, repo, cache, files } = scenario();
    const shared = join(root, "shared");
    mkdirSync(shared);
    symlinkSync(shared, join(repo, "graphify-out"));

    const report = buildIndex(repo, deps(fakeRunner(), cache));

    expect(readlinkSync(join(repo, "graphify-out"))).toBe(shared);
    const warning = `${join(repo, "graphify-out")} links to ${shared}, not into the cache; left alone`;
    expect(report).toMatchObject({ kind: "built", result: "ok", warning });
    expect(statusOf(files.status)).toMatchObject({ warning });
  });

  test("a moved repository's build points the symlink at its new cache directory", () => {
    const { root, repo, cache } = scenario();
    buildIndex(repo, deps(fakeRunner(), cache));
    const moved = join(root, "moved");
    renameSync(repo, moved);

    const report = buildIndex(moved, deps(fakeRunner(), cache));

    const target = join(cacheFiles(moved, { QSM_INDEX_CACHE_DIR: cache }).dir, "graphify-out");
    expect(readlinkSync(join(moved, "graphify-out"))).toBe(target);
    expect(report).toMatchObject({ result: "ok", warning: null });
    expect(git(moved, "status", "--porcelain", "-uall")).toBe("");
  });
});

describe("A cloned repository is queried exactly like the agent's own", () => {
  test("a repository under the Clonned directory is indexed into the cache", () => {
    const home = sandbox("qsm-index-home-");
    const repo = join(home, "Clonned", "dep");
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, "a.ts"), "export const a = 1;\n");
    git(home, "init", "-q", repo);
    commit(repo, "one");
    const env = { HOME: home };

    buildIndex(repo, { cwd: "/", run: fakeRunner().run, env });

    const { dir } = cacheFiles(repo, env);
    expect(dir.startsWith(join(home, ".cache", "qsm-index"))).toBe(true);
    expect(existsSync(join(dir, "graphify-out", "graph.json"))).toBe(true);
    expect(lstatSync(join(repo, "graphify-out")).isSymbolicLink()).toBe(true);
    expect(git(repo, "status", "--porcelain", "-uall")).toBe("");
  });
});
