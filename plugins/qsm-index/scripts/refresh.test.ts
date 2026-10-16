// The two verbs the PostToolUse hooks call to refresh an index during a session, run the way the
// hooks' noun runs them: this checkout's CLI under --json, judged on its envelope and on whether
// it started a build. A started build opens build.log before the verb returns, so the log file is
// the proof a refresh started. Throwaway git repositories with a built index; on PATH a fake
// graphify, a fake semble, and `qsm-index` running this checkout's CLI. A build still running
// when a test ends is killed with its process group, then every sandbox is removed. Which tool
// call reaches which verb is hooks/register.test.ts.

import { expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildIndex } from "../lib/build.ts";
import { readStatus } from "../lib/state.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { detachedBuildTests, fakeRunner, untilRefreshed, verb, world } from "../lib/test-repo.ts";

detachedBuildTests();

/** A repository with one source file and its cache, indexed unless told otherwise, and the PATH
 * described at the top. */
function indexedWorld(indexed = true) {
  const made = world("qsm-index-refresh-");
  if (indexed) {
    buildIndex(made.repo, { cwd: "/", run: fakeRunner().run, env: made.env });
  }
  return made;
}

function edited(env: Record<string, string>, file: string, cwd?: string) {
  return verb(env, "edited", file, ...(cwd === undefined ? [] : ["--cwd", cwd]));
}

/** Whether every edit of `files` answered ok. */
function editsAreOk(files: readonly string[], env: Record<string, string>): boolean {
  return files.every((file) => edited(env, file).code === "ok");
}

/** `f<from>.ts` to `f<to>.ts` under `dir`. */
function numbered(dir: string, from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, i) => join(dir, `f${from + i}.ts`));
}

test("reindex --if-indexed starts a refresh of an indexed repository", async () => {
  const { repo, env, files } = indexedWorld();
  const before = readStatus(files.status)?.started_at;

  const r = verb(env, "reindex", join(repo, "src"), "--if-indexed");

  expect({ exit: r.exit, code: r.code }).toEqual({ exit: 0, code: "ok" });
  expect(r.message).toBe(`started a build of ${repo}`);
  expect(existsSync(files.log)).toBe(true);
  await untilRefreshed(files, before);
});

test("the twentieth distinct edited file starts a refresh", async () => {
  const { repo, env, files } = indexedWorld();
  const before = readStatus(files.status)?.started_at;
  expect(editsAreOk(numbered(repo, 1, 19), env)).toBe(true);
  expect(existsSync(files.log)).toBe(false);

  expect(edited(env, join(repo, "src", "f20.ts")).message).toBe(`started a build of ${repo}`);

  expect(existsSync(files.log)).toBe(true);
  await untilRefreshed(files, before);
  expect(existsSync(files.edits)).toBe(false);
});

test("editing the same file again does not count twice", () => {
  const { repo, env, files } = indexedWorld();

  expect(
    editsAreOk(
      Array.from({ length: 20 }, () => join(repo, "src", "a.ts")),
      env,
    ),
  ).toBe(true);

  expect(existsSync(files.log)).toBe(false);
});

test("an edited path relative to --cwd counts as the absolute file", () => {
  const { repo, env, files } = indexedWorld();

  edited(env, "src/a.ts", repo);
  const again = edited(env, join(repo, "src", "a.ts"));

  expect(again.message).toBe(`${join(repo, "src", "a.ts")} is counted already`);
  expect(existsSync(files.log)).toBe(false);
});

test("an edit outside any repository counts nothing", () => {
  const { env, files } = indexedWorld();
  const plain = sandboxDir("qsm-index-refresh-plain-");

  expect(editsAreOk(numbered(plain, 1, 1), env)).toBe(true);

  expect(existsSync(files.edits)).toBe(false);
  expect(existsSync(files.log)).toBe(false);
});

// One edit is enough: the refusal comes before the count, so no edit is ever counted or built on.
test("a repository with no index or a declined one is not refreshed by a hook", () => {
  for (const declined of [false, true]) {
    const { repo, env, files } = indexedWorld(declined);
    if (declined) {
      writeFileSync(files.declined, "");
    }

    expect(verb(env, "reindex", repo, "--if-indexed").code).toBe("ok");
    expect(editsAreOk(numbered(repo, 1, 1), env)).toBe(true);

    expect(existsSync(files.log)).toBe(false);
    expect(existsSync(files.edits)).toBe(false);
  }
});

test("a refresh a hook cannot start says why", () => {
  const { repo, env, files } = indexedWorld();
  const offPath = { ...env, PATH: "/usr/bin:/bin" };

  const r = verb(offPath, "reindex", repo, "--if-indexed");

  expect({ exit: r.exit, code: r.code }).toEqual({ exit: 1, code: "failed" });
  expect(r.message).toBe("qsm-index could not start a background build: qsm-index is not on PATH");
  expect(existsSync(files.log)).toBe(false);
});
