// Index-specific test worlds: a repository, its cache and a PATH of fakes. Their directories come
// from `sandboxDir`; `killBuilds` ends the builds a test left running.

import { afterEach, setDefaultTimeout } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cliShim, fakeBin } from "../../../lib/fixtures/bin.ts";
import { envelopeOf, isolatedEnv, runBin } from "../../../lib/fixtures/cli.ts";
import { repoWith } from "../../../lib/fixtures/git.ts";
import { type CacheFiles, cacheFiles } from "./paths.ts";
import { type RunResult, spawnRunner } from "./run.ts";
import { liveHolder, readStatus } from "./state.ts";

/** Lock files of the builds a test started detached. */
const locks: string[] = [];

/** Kills the builds a test left running, with their process groups. */
export function killBuilds(): void {
  for (const lock of locks.splice(0)) {
    const holder = liveHolder(lock);
    if (holder !== null && holder.pid !== process.pid) {
      process.kill(-holder.pid, "SIGKILL");
    }
  }
}

/** A sandbox holding a repository with one commit, and a cache root beside it. */
export function repoWithCache(prefix: string): { root: string; repo: string; cache: string } {
  const { root, repo } = repoWith(prefix, { "src/a.ts": "export const a = 1;\n" });
  return { root, repo, cache: join(root, "index-cache") };
}

/** Real git; graphify writes the graph, anything else answers empty, and a command named in
 * `fail` fails with that detail. `calls` lists the commands that were not git. */
export function fakeRunner(fail: Record<string, string> = {}) {
  const calls: string[] = [];
  const run = (command: string, args: readonly string[]): RunResult => {
    if (command === "git") {
      return spawnRunner(command, args);
    }
    calls.push(command);
    const detail = fail[command];
    if (detail !== undefined) {
      return { ok: false, stdout: "", detail };
    }
    if (command === "graphify") {
      mkdirSync(join(String(args[1]), "graphify-out"), { recursive: true });
      writeFileSync(join(String(args[1]), "graphify-out", "graph.json"), "{}");
    }
    return { ok: true, stdout: "", detail: "" };
  };
  return { run, calls };
}

const CLI = resolve(import.meta.dir, "..", "scripts", "cli.ts");

/** A repository, its cache, and a PATH whose `qsm-index` is this checkout's CLI, whose graphify
 * runs `before(root)` and then writes the graph, and whose semble answers nothing. A build left
 * running is killed by `killBuilds`. */
export function world(prefix: string, before: (root: string) => string = () => "") {
  const { root, repo, cache } = repoWithCache(prefix);
  const bin = join(root, "bin");
  mkdirSync(bin);
  cliShim(bin, "qsm-index", CLI);
  fakeBin(
    bin,
    "graphify",
    `${before(root)}\nmkdir -p "$2/graphify-out" && echo '{}' > "$2/graphify-out/graph.json"`,
  );
  fakeBin(bin, "semble", "exit 0");
  const env = isolatedEnv(root, {
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    QSM_INDEX_CACHE_DIR: cache,
  });
  const files = cacheFiles(repo, env);
  locks.push(files.lock);
  return { root, repo, cache, env, files };
}

export async function until(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise((done) => {
      setTimeout(done, 50);
    });
  }
}

/** The top of a test file that starts detached builds: a long limit, and every build
 * killed after each test. */
export function detachedBuildTests(): void {
  setDefaultTimeout(30_000);
  afterEach(killBuilds);
}

/** One verb of this checkout's CLI under `--json`, the way a hook's noun runs it: the exit and
 * the outcome envelope it printed. */
export function verb(env: Record<string, string>, ...args: string[]) {
  return envelopeOf(runBin(CLI, [...args, "--json"], { env }).stdout);
}

/** Waits for a build that started after `before` to finish. */
export function untilRefreshed(files: CacheFiles, before: string | undefined): Promise<void> {
  return until(() => {
    const now = readStatus(files.status);
    return now?.state === "done" && now.started_at !== before;
  }, "the refresh to finish");
}
