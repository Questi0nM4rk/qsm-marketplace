// The tools' own behaviour. The lookups run with a fake runner in place of the two external
// commands; reindex and status run in throwaway git repositories, the detached build through a
// `qsm-index` on PATH that runs this checkout's CLI and fakes of graphify and semble beside it.
// A build still running when a test ends is killed with its process group, then every sandbox
// is removed, whether the test passed or failed.

import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildIndex } from "./build.ts";
import { cacheFiles, type Env } from "./paths.ts";
import { type RunResult, spawnRunner } from "./run.ts";
import { liveHolder, readStatus } from "./state.ts";
import { commit, git } from "../../../lib/fixtures/git.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { fakeRunner, killBuilds, repoWithCache, until, world } from "./test-repo.ts";
import { context, impact, reindex, search, status, structure } from "./tools.ts";

// A detached build starts a bun process and a fake graphify that sleeps; the default 5 s test
// limit is too tight for the slowest of them.
setDefaultTimeout(20_000);

// A build is killed through its lock file in the sandbox; this file's afterEach runs before the
// preload's, which removes the sandbox.
afterEach(killBuilds);

const HIT: RunResult = { ok: true, stdout: "hit\n", detail: "" };

/** Records every external call but git's, which it answers as if each directory were the top
 * level of its own repository. */

function recorder(result: RunResult = HIT) {
  const calls: string[][] = [];
  return {
    calls,
    run: (command: string, args: readonly string[]): RunResult => {
      if (command === "git") {
        return { ok: true, stdout: `${args[1]}\n`, detail: "" };
      }
      calls.push([command, ...args]);
      return result;
    },
  };
}

const ABSENT: RunResult = { ok: false, stdout: "", detail: "semble is not available: ENOENT" };

describe("Query an indexed tree", () => {
  test("Query an indexed tree", () => {
    const dir = sandboxDir("qsm-index-tools-");
    const runner = recorder();
    expect(search({ path: dir, query: "where is the parser", top_k: 99 }, runner.run)).toEqual({
      ok: true,
      text: "hit",
    });
    expect(runner.calls[0]).toEqual(["semble", "search", "-k", "20", "where is the parser", dir]);
  });

  test("a chunk of the graph's own report is not a search result", () => {
    const stdout =
      "Search results for: 'q'\n\n## 1. graphify-out/GRAPH_REPORT.md:1-9  [score=0.9]\n```\nx\n```\n\n## 2. src/a.ts:1-9  [score=0.5]\n```\ny\n```\n";

    const outcome = search(
      { path: sandboxDir("qsm-index-tools-"), query: "q" },
      recorder({ ok: true, stdout, detail: "" }).run,
    );

    expect(outcome.text).not.toContain("GRAPH_REPORT");
    expect(outcome.text).toContain("## 2. src/a.ts:1-9");
    expect(outcome.text).toStartWith("Search results for: 'q'");
  });

  test("without a result count it asks for five", () => {
    const runner = recorder();
    search({ path: sandboxDir("qsm-index-tools-"), query: "q" }, runner.run);
    expect(runner.calls[0]?.[3]).toBe("5");
  });
});

describe("Path is not absolute or does not exist", () => {
  test("both are error results, and neither shells out", () => {
    const runner = recorder();
    expect(search({ path: "relative/tree", query: "q" }, runner.run).ok).toBe(false);
    expect(search({ path: "/nope/missing", query: "q" }, runner.run).text).toContain(
      "does not exist",
    );
    expect(search({ path: sandboxDir("qsm-index-tools-"), query: "  " }, runner.run).text).toBe(
      "query is required",
    );
    expect(runner.calls).toEqual([]);
  });

  test("a missing semble answers an error result", () => {
    const outcome = search(
      { path: sandboxDir("qsm-index-tools-"), query: "q" },
      recorder(ABSENT).run,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.text).toContain("semble is not available");
  });
});

/** Real git; graphify answers `stdout`, and every call to it is recorded. */
function graphRunner(stdout = "node a.ts\n") {
  const calls: string[][] = [];
  return {
    calls,
    run: (command: string, args: readonly string[]): RunResult => {
      if (command === "git") {
        return spawnRunner(command, args);
      }
      calls.push([command, ...args]);
      return { ok: true, stdout, detail: "" };
    },
  };
}

describe("structure", () => {
  test("Explain a node", () => {
    const { repo, env } = built();
    const runner = graphRunner();
    expect(structure({ repo, op: "explain", node: "parser.ts" }, runner.run, env).ok).toBe(true);
    expect(runner.calls[0]).toEqual([
      "graphify",
      "explain",
      "parser.ts",
      "--graph",
      join(repo, "graphify-out", "graph.json"),
    ]);
  });

  test("Path between two nodes", () => {
    const { repo, env } = built();
    const runner = graphRunner();
    structure({ repo, op: "path", node: "a.ts", to: "b.ts" }, runner.run, env);
    expect(runner.calls[0]?.slice(0, 4)).toEqual(["graphify", "path", "a.ts", "b.ts"]);
  });

  test("structure answers no path found for two unconnected nodes", () => {
    const { repo, env } = built();
    const answer = structure(
      { repo, op: "path", node: "a.ts", to: "z.ts" },
      graphRunner("No path found between 'a.ts' and 'z.ts'.\n").run,
      env,
    );
    expect(answer.ok).toBe(true);
    expect(answer.text).toStartWith("No path found");
  });

  test("op=path without an end node is an error, not a call", () => {
    const { repo, env } = built();
    const runner = graphRunner();
    expect(structure({ repo, op: "path", node: "a.ts" }, runner.run, env).text).toContain(
      "'to' is required",
    );
    expect(runner.calls).toEqual([]);
  });
});

const NODES = [
  { id: "d", label: "d()", source_file: "src/a.ts", source_location: "L20" },
  { id: "f", label: "a.ts", source_file: "src/a.ts", source_location: "L1" },
  { id: "c", label: "c()", source_file: "src/a.ts", source_location: "L10" },
  { id: "o", label: "other()", source_file: "src/b.ts", source_location: "L5" },
];

function withGraph() {
  const found = built();
  writeFileSync(join(found.repo, "graphify-out", "graph.json"), JSON.stringify({ nodes: NODES }));
  return found;
}

describe("impact", () => {
  test("impact asks graphify affected for the node, the depth and the graph file", () => {
    const { repo, env } = built();
    const runner = graphRunner("Affected nodes for c()\n- d() [calls] src/a.ts:L20\n");

    const answer = impact({ repo, node: "c()", depth: 1 }, runner.run, env);

    expect(runner.calls[0]).toEqual([
      "graphify",
      "affected",
      "c()",
      "--depth",
      "1",
      "--graph",
      join(repo, "graphify-out", "graph.json"),
    ]);
    expect(answer).toEqual({
      ok: true,
      text: "Affected nodes for c()\n- d() [calls] src/a.ts:L20",
    });
  });

  test("impact defaults the depth to two", () => {
    const { repo, env } = built();
    const runner = graphRunner("Affected nodes for c()\n- d() [calls] src/a.ts:L20\n");
    impact({ repo, node: "c()" }, runner.run, env);
    expect(runner.calls[0]?.slice(3, 5)).toEqual(["--depth", "2"]);
  });

  test("impact answers unknown for a node nothing depends on", () => {
    const { repo, env } = built();
    const answer = impact(
      { repo, node: "other()" },
      graphRunner("Affected nodes for other()\nDepth: 2\nNo affected nodes found.\n").run,
      env,
    );

    expect(answer.ok).toBe(true);
    expect(answer.text).toStartWith("unknown:");
    expect(answer.text).not.toContain("safe");
  });

  test("impact answers an error for a node name the graph cannot match", () => {
    const { repo, env } = built();
    const answer = impact(
      { repo, node: "nope" },
      graphRunner("No unique node match for nope\n").run,
      env,
    );

    expect(answer).toEqual({ ok: false, text: "nope matches no single node of the graph" });
  });
});

describe("context", () => {
  test("context lists the symbols of a file ordered by start line", () => {
    const { repo, env } = withGraph();

    const answer = context({ repo, target: "src/a.ts" }, graphRunner().run, env);

    expect(answer.text.split("\n").slice(0, 3)).toEqual(["L1 a.ts", "L10 c()", "L20 d()"]);
    expect(answer.text).not.toContain("other()");
  });

  test("context with a line marks the enclosing symbol and adds related chunks", () => {
    const { repo, env } = withGraph();
    const runner = graphRunner("chunk x\n");

    const answer = context({ repo, target: "src/a.ts:12" }, runner.run, env);

    expect(answer.text).toContain("L10 c()  <- encloses the line");
    expect(answer.text).not.toContain("L1 a.ts  <-");
    expect(answer.text).toContain("related to src/a.ts:12:\nchunk x");
    expect(runner.calls[0]).toEqual(["semble", "find-related", "src/a.ts", "12", repo]);
  });

  test("context answers an error for a file the graph does not hold", () => {
    const { repo, env } = withGraph();

    const answer = context({ repo, target: "src/missing.ts" }, graphRunner().run, env);

    expect(answer).toEqual({ ok: false, text: "no node of src/missing.ts in the graph" });
  });
});

describe("the staleness line", () => {
  test("a graph answer from a fresh index carries no staleness line", () => {
    const { repo, env } = built();
    const answer = structure({ repo, op: "explain", node: "a.ts" }, graphRunner().run, env);
    expect(answer).toEqual({ ok: true, text: "node a.ts" });
  });

  test("a graph answer from a stale index carries the staleness line", async () => {
    const { repo, env, files } = background(2);
    buildIndex(repo, { cwd: "/", run: fakeRunner().run, env });
    writeFileSync(join(repo, "b.ts"), "b\n");
    commit(repo, "two");
    writeFileSync(join(repo, "c.ts"), "c\n");
    commit(repo, "three");
    writeFileSync(join(repo, "src", "a.ts"), "changed\n");
    writeFileSync(join(repo, "d.ts"), "d\n");
    writeFileSync(join(repo, "e.ts"), "e\n");

    const started = performance.now();
    const answer = structure({ repo, op: "explain", node: "a.ts" }, graphRunner().run, env);
    const elapsed = performance.now() - started;

    expect(answer).toEqual({
      ok: true,
      text: "index is stale; reindex started\nnode a.ts",
    });
    expect(elapsed).toBeLessThan(1000);
    await until(() => liveHolder(files.lock) !== null, "the build to take its lock");
    const again = structure({ repo, op: "explain", node: "a.ts" }, graphRunner().run, env);
    expect(again.text.split("\n")[0]).toBe("index is stale; reindex running");
    await until(() => readStatus(files.status)?.state === "done", "the build to finish");
  });
});

describe("a stale answer that starts nothing", () => {
  test("a stale answer in a declined repository says run reindex", () => {
    const { repo, env, files } = background(0);
    buildIndex(repo, { cwd: "/", run: fakeRunner().run, env });
    writeFileSync(join(repo, "b.ts"), "b\n");
    commit(repo, "two");
    writeFileSync(files.declined, "");
    const before = readFileSync(files.status, "utf8");

    const answer = structure({ repo, op: "explain", node: "a.ts" }, graphRunner().run, env);

    expect(answer.text).toBe("index is stale; run reindex\nnode a.ts");
    expect(existsSync(files.log)).toBe(false);
    expect(readFileSync(files.status, "utf8")).toBe(before);
  });

  test("a stale answer above 5000 files says run reindex and starts nothing", () => {
    const { repo, env, files } = background(0);
    for (let i = 0; i < 5000; i += 1) {
      writeFileSync(join(repo, "src", `f${i}.py`), "");
    }
    commit(repo, "5001 files");
    buildIndex(repo, { cwd: "/", run: fakeRunner().run, env });
    writeFileSync(join(repo, "b.ts"), "b\n");
    commit(repo, "two");

    const answer = structure({ repo, op: "explain", node: "a.ts" }, graphRunner().run, env);

    expect(answer.text.split("\n")[0]).toBe("index is stale; run reindex");
    expect(existsSync(files.log)).toBe(false);
  });
});

describe("a graph read with no index, and search", () => {
  test("No structural index built yet", () => {
    const { repo, env, files } = background(0);
    const runner = graphRunner();

    const answer = structure({ repo, op: "explain", node: "a.ts" }, runner.run, env);

    expect(answer).toEqual({ ok: false, text: `no structural index of ${repo}; run reindex` });
    expect(runner.calls).toEqual([]);
    expect(existsSync(files.log)).toBe(false);
  });

  test("search carries no staleness line", () => {
    const { repo, env } = built();
    writeFileSync(join(repo, "b.ts"), "b\n");
    commit(repo, "two");
    expect(search({ path: repo, query: "q" }, graphRunner("hit\n").run)).toEqual({
      ok: true,
      text: "hit",
    });
    expect(existsSync(cacheFiles(repo, env).log)).toBe(false);
  });
});

/** A repository, its cache, and a PATH whose graphify sleeps `seconds` and counts its runs in
 * `runs` before it writes the graph. */
function background(seconds: number) {
  const made = world(
    "qsm-index-reindex-",
    (root) => `echo run >> "${join(root, "graphify-runs")}"\nsleep ${seconds}`,
  );
  const runs = join(made.root, "graphify-runs");
  const runCount = () => (existsSync(runs) ? readFileSync(runs, "utf8").split("\n").length - 1 : 0);
  return { ...made, runCount };
}

describe("reindex", () => {
  test("reindex returns before the build finishes", async () => {
    const { repo, env, files } = background(3);

    const started = performance.now();
    const outcome = reindex({ path: repo }, spawnRunner, env);
    const elapsed = performance.now() - started;

    expect(outcome).toEqual({ ok: true, text: `started a build of ${repo}` });
    expect(elapsed).toBeLessThan(1000);
    await until(() => liveHolder(files.lock) !== null, "the build to take its lock");
    const { text } = status({ path: repo }, spawnRunner, env);
    expect(text).toContain("build: running, phase graph");
  });

  test("a second reindex while a build runs starts nothing and says so", async () => {
    const { repo, env, files, runCount } = background(2);
    reindex({ path: repo }, spawnRunner, env);
    await until(() => liveHolder(files.lock) !== null, "the build to take its lock");
    const since = liveHolder(files.lock)?.started_at;

    const second = reindex({ path: repo }, spawnRunner, env);

    expect(second).toEqual({
      ok: true,
      text: `a build of ${repo} is already running since ${since}`,
    });
    await until(() => readStatus(files.status)?.state === "done", "the build to finish");
    expect(runCount()).toBe(1);
  });
});

describe("the lock", () => {
  test("a lock left by a dead build is taken over", async () => {
    const { repo, env, files } = background(1);
    mkdirSync(files.dir, { recursive: true });
    const dead = spawnSync("true").pid;
    const stale = { pid: dead, started_at: "2026-01-01T00:00:00.000Z" };
    writeFileSync(files.lock, JSON.stringify(stale));

    expect(reindex({ path: repo }, spawnRunner, env).text).toBe(`started a build of ${repo}`);

    await until(() => liveHolder(files.lock) !== null, "the new build to take the lock");
    expect(liveHolder(files.lock)?.pid).not.toBe(dead);
    await until(() => readStatus(files.status)?.state === "done", "the build to finish");
    expect(readStatus(files.status)?.result).toBe("ok");
  });
});

function built(fail: Record<string, string> = {}) {
  const { repo, cache } = repoWithCache("qsm-index-status-");
  const env: Env = { QSM_INDEX_CACHE_DIR: cache };
  buildIndex(repo, { cwd: "/", run: fakeRunner(fail).run, env });
  return { repo, cache, env };
}

describe("status", () => {
  test("status reports the last build's result and duration", () => {
    const { repo, env } = built();
    const duration = readStatus(cacheFiles(repo, env).status)?.duration_ms;

    const { text } = status({ path: repo }, spawnRunner, env);

    expect(text).toBe(
      [
        `index of ${repo}: present`,
        `built at ${git(repo, "rev-parse", "HEAD")}, at HEAD`,
        "0 files changed since the build",
        "build: not running",
        `last build: ok in ${duration} ms`,
      ].join("\n"),
    );
  });

  test("status reports a failed build and its cause", () => {
    const { repo, env } = built({ graphify: "graphify exited 1: boom" });
    const { text } = status({ path: repo }, spawnRunner, env);
    expect(text).toContain(`index of ${repo}: absent`);
    expect(text).toMatch(/last build: failed in \d+ ms: graphify exited 1: boom/);
  });

  test("status reports an absent index for a repository never built", () => {
    const { repo, cache } = repoWithCache("qsm-index-status-");
    const env: Env = { QSM_INDEX_CACHE_DIR: cache };

    const outcome = status({ path: join(repo, "src") }, spawnRunner, env);

    expect(outcome).toEqual({
      ok: true,
      text: [`index of ${repo}: absent`, "build: not running", "last build: none"].join("\n"),
    });
    expect(existsSync(cache)).toBe(false);
  });
});

describe("status freshness", () => {
  test("status counts the commits HEAD moved and the files changed since the build", () => {
    const { repo, env } = built();
    writeFileSync(join(repo, "b.ts"), "b\n");
    commit(repo, "two");
    writeFileSync(join(repo, "c.ts"), "c\n");
    commit(repo, "three");
    writeFileSync(join(repo, "src", "a.ts"), "changed\n");
    writeFileSync(join(repo, "d.ts"), "d\n");
    writeFileSync(join(repo, "e.ts"), "e\n");

    const { text } = status({ path: repo }, spawnRunner, env);

    expect(text).toContain(", 2 commits behind HEAD");
    expect(text).toContain("3 files changed since the build");
  });

  test("a tree dirty when the build ran is not counted as changed", () => {
    const { repo, cache } = repoWithCache("qsm-index-status-");
    const env: Env = { QSM_INDEX_CACHE_DIR: cache };
    writeFileSync(join(repo, "src", "a.ts"), "dirty\n");
    buildIndex(repo, { cwd: "/", run: fakeRunner().run, env });

    expect(status({ path: repo }, spawnRunner, env).text).toContain(
      "0 files changed since the build",
    );
  });
});
