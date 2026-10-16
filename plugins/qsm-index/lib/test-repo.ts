// Throwaway git repositories for the tests. Their directories come from `sandboxDir`; `killBuilds`
// ends the builds a test left running.

import { afterEach, setDefaultTimeout } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { type Envelope, isRecord, OUTCOME_CODES, type OutcomeCode } from "../../../lib/outcome.ts";
import { type CacheFiles, cacheFiles, type Env } from "./paths.ts";
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

/** git in `repo`, with no hook, no signing and a fixed identity, whatever the machine says. */
export function git(repo: string, ...args: string[]): string {
  const r = spawnSync(
    "git",
    ["-C", repo, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t",
      },
    },
  );
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  }
  return r.stdout.trim();
}

/** A commit of everything in the tree. */
export function commit(repo: string, message: string): void {
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", message);
}

/** A sandbox holding a repository with one commit, and a cache root beside it. */
export function repoWithCache(prefix: string): { root: string; repo: string; cache: string } {
  const root = sandboxDir(prefix);
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  git(root, "init", "-q", repo);
  commit(repo, "one");
  return { root, repo, cache: join(root, "cache") };
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

function executable(path: string, body: string): void {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

/** A repository, its cache, and a PATH whose `qsm-index` is this checkout's CLI, whose graphify
 * runs `before(root)` and then writes the graph, and whose semble answers nothing. A build left
 * running is killed by `killBuilds`. */
export function world(prefix: string, before: (root: string) => string = () => "") {
  const { root, repo, cache } = repoWithCache(prefix);
  const bin = join(root, "bin");
  mkdirSync(bin);
  executable(join(bin, "qsm-index"), `exec "${process.execPath}" "${CLI}" "$@"`);
  executable(
    join(bin, "graphify"),
    `${before(root)}\nmkdir -p "$2/graphify-out" && echo '{}' > "$2/graphify-out/graph.json"`,
  );
  executable(join(bin, "semble"), "exit 0");
  const env: Env = {
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    HOME: root,
    QSM_INDEX_CACHE_DIR: cache,
  };
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
export function verb(env: Env, ...args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args, "--json"], { encoding: "utf8", env });
  return parseEnvelope(r.stdout);
}

function isOutcomeCode(value: unknown): value is OutcomeCode {
  return OUTCOME_CODES.some((code) => code === value);
}

/** The outcome envelope a CLI printed under `--json`; anything else fails the test. */
export function parseEnvelope(stdout: string): Envelope {
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed)) {
    throw new Error(`not an envelope: ${stdout}`);
  }
  const code = parsed.code;
  const exit = parsed.exit;
  const reason = parsed.reason;
  const message = parsed.message;
  const warnings = parsed.warnings;
  if (
    !isOutcomeCode(code) ||
    typeof exit !== "number" ||
    typeof reason !== "string" ||
    typeof message !== "string" ||
    !Array.isArray(warnings) ||
    !warnings.every((warning) => typeof warning === "string")
  ) {
    throw new Error(`not an envelope: ${stdout}`);
  }
  return { code, exit, reason, message, warnings, data: parsed.data };
}

/** Waits for a build that started after `before` to finish. */
export function untilRefreshed(files: CacheFiles, before: string | undefined): Promise<void> {
  return until(() => {
    const now = readStatus(files.status);
    return now?.state === "done" && now.started_at !== before;
  }, "the refresh to finish");
}
