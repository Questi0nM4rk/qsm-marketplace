// The session-start decision, run the way the session-start hook's noun runs it: this checkout's
// `qsm-index auto <cwd> --json`, judged on its exit and on the ask text its envelope carries for
// the hook to hand the session. Throwaway git repositories; on PATH a fake graphify that sleeps and
// writes the graph, a fake semble, and `qsm-index` running this checkout's CLI, so a started build
// is the real detached build. A build still running when a test ends is killed with its process
// group, then every sandbox is removed. Which event reaches the verb is hooks/register.test.ts.

import { expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { auto } from "../lib/auto.ts";
import { buildIndex } from "../lib/build.ts";
import { spawnRunner } from "../lib/run.ts";
import { readStatus } from "../lib/state.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import {
  detachedBuildTests,
  fakeRunner,
  until,
  untilRefreshed,
  verb,
  world,
} from "../lib/test-repo.ts";

detachedBuildTests();

/** A repository with one source file, its cache, and the PATH described at the top. */
function sleepyWorld() {
  return world("qsm-index-hook-", () => "sleep 1");
}

/** The verb's exit and the context the hook hands the session: the envelope's `askText`, or null
 * when there is nothing to ask. */
function hook(cwd: string, env: Record<string, string>) {
  const r = verb(env, "auto", cwd);
  const askText: unknown =
    typeof r.data === "object" && r.data !== null ? Reflect.get(r.data, "askText") : null;
  return { exit: r.exit, context: typeof askText === "string" ? askText : null };
}

const silent = { exit: 0, context: null };

/** `count` more source files, untracked, so an index built before them is stale. */
function moreFiles(repo: string, count: number): void {
  for (let i = 0; i < count; i += 1) {
    writeFileSync(join(repo, "src", `f${i}.py`), "");
  }
}

test("the session-start hook says nothing outside a git repository", () => {
  const { env } = sleepyWorld();
  expect(hook(sandboxDir("qsm-index-hook-plain-"), env)).toEqual(silent);
  expect(existsSync(String(env.QSM_INDEX_CACHE_DIR))).toBe(false);
});

test("the session-start hook asks before the first index of a repository", () => {
  const { repo, env, files } = sleepyWorld();

  const { exit, context } = hook(join(repo, "src"), env);

  expect(exit).toBe(0);
  expect(context).toContain(`${repo} has no qsm-index map yet`);
  expect(context).toContain("AskUserQuestion");
  expect(context).toContain(`qsm-index auto ${repo} --consent yes`);
  expect(context).toContain(`qsm-index auto ${repo} --consent no`);
  expect(context).not.toContain("WARNING");
  expect(existsSync(files.lock)).toBe(false);
});

test("the first ask warns that a repository above 5000 files will be large", () => {
  const { repo, env, files } = sleepyWorld();
  // with src/a.ts, 5001
  moreFiles(repo, 5000);

  const { context } = hook(repo, env);

  expect(context).toContain("5001 files, about 75 MB and 365 s to build");
  expect(context).toContain("WARNING: it will be large");
  expect(existsSync(files.lock)).toBe(false);
});

test("a stale index of at most 5000 files is refreshed in the background without a word", async () => {
  const { repo, env, files } = sleepyWorld();
  buildIndex(repo, { cwd: "/", run: fakeRunner().run, env });
  const before = readStatus(files.status)?.started_at;
  // with src/a.ts, 5000
  moreFiles(repo, 4999);

  expect(hook(repo, env)).toEqual(silent);

  await untilRefreshed(files, before);
  expect(readStatus(files.status)?.result).toBe("ok");
});

test("a stale index above 5000 files asks whether to reindex", () => {
  const { repo, env, files } = sleepyWorld();
  buildIndex(repo, { cwd: "/", run: fakeRunner().run, env });
  const before = readStatus(files.status);
  moreFiles(repo, 5000);

  const { context } = hook(repo, env);

  expect(context).toContain(`The qsm-index map of ${repo} is stale (5001 files`);
  expect(context).toContain("WARNING: it will be large");
  expect(context).toContain("whether to reindex it");
  expect(readStatus(files.status)).toEqual(before);
});

test("a fresh index or a running build is left alone without a word", () => {
  const { repo, env, files } = sleepyWorld();
  buildIndex(repo, { cwd: "/", run: fakeRunner().run, env });
  const built = readStatus(files.status);

  expect(hook(repo, env)).toEqual(silent);
  expect(readStatus(files.status)).toEqual(built);

  moreFiles(repo, 1);
  writeFileSync(
    files.lock,
    JSON.stringify({ pid: process.pid, started_at: "2026-10-01T10:00:00Z" }),
  );
  expect(hook(repo, env)).toEqual(silent);
  expect(readStatus(files.status)).toEqual(built);
});

test("a recorded no stops auto from asking again", () => {
  const { repo, env, files } = sleepyWorld();

  expect(auto({ path: repo, consent: "no" }, spawnRunner, env)).toEqual({
    answer: "declined",
    repo,
  });

  expect(existsSync(files.declined)).toBe(true);
  expect(hook(repo, env)).toEqual(silent);
  expect(existsSync(files.status)).toBe(false);
});

test("a yes starts the build and lifts an earlier no", async () => {
  const { repo, env, files } = sleepyWorld();
  moreFiles(repo, 5000);
  auto({ path: repo, consent: "no" }, spawnRunner, env);

  expect(auto({ path: repo, consent: "yes" }, spawnRunner, env)).toEqual({
    answer: "started",
    repo,
  });

  expect(existsSync(files.declined)).toBe(false);
  await until(() => readStatus(files.status)?.state === "done", "the build to finish");
});

test("a refresh that cannot start says why", () => {
  const { repo, env, files } = sleepyWorld();
  buildIndex(repo, { cwd: "/", run: fakeRunner().run, env });
  moreFiles(repo, 1);

  const r = verb({ ...env, PATH: "/usr/bin:/bin" }, "auto", repo);

  expect({ exit: r.exit, code: r.code }).toEqual({ exit: 1, code: "failed" });
  expect(r.message).toBe("qsm-index could not start a background build: qsm-index is not on PATH");
  expect(existsSync(files.lock)).toBe(false);
});
