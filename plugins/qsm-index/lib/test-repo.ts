// Throwaway git repositories for the tests. Every sandbox the tests make is listed here and
// removed by `removeSandboxes`, which each test file calls in its afterEach.

import { afterEach, setDefaultTimeout } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Envelope, OUTCOME_CODES, type OutcomeCode } from "../../../lib/outcome.ts";
import { type CacheFiles, cacheFiles, type Env } from "./paths.ts";
import { type RunResult, spawnRunner } from "./run.ts";
import { liveHolder, readStatus } from "./state.ts";

const sandboxes: string[] = [];

export function sandbox(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  sandboxes.push(dir);
  return dir;
}

/** Lock files of the builds a test started detached. */
const locks: string[] = [];

/** Kills the builds a test left running, with their process groups, then removes every sandbox. */
export function removeSandboxes(): void {
  for (const lock of locks.splice(0)) {
    const holder = liveHolder(lock);
    if (holder !== null && holder.pid !== process.pid) {
      process.kill(-holder.pid, "SIGKILL");
    }
  }
  while (sandboxes.length > 0) {
    rmSync(sandboxes.pop() ?? "", { recursive: true, force: true });
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
  const root = sandbox(prefix);
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
 * running is killed by `removeSandboxes`. */
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

/** The top of a test file that starts detached builds: a long limit, and every build and sandbox
 * removed after each test. */
export function detachedBuildTests(): void {
  setDefaultTimeout(30_000);
  afterEach(removeSandboxes);
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

function field(record: object, name: string): unknown {
  return Reflect.get(record, name);
}

/** The outcome envelope a CLI printed under `--json`; anything else fails the test. */
export function parseEnvelope(stdout: string): Envelope {
  const parsed: unknown = JSON.parse(stdout);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`not an envelope: ${stdout}`);
  }
  const code = field(parsed, "code");
  const exit = field(parsed, "exit");
  const reason = field(parsed, "reason");
  const message = field(parsed, "message");
  const warnings = field(parsed, "warnings");
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
  return { code, exit, reason, message, warnings, data: field(parsed, "data") };
}

/** Waits for a build that started after `before` to finish. */
export function untilRefreshed(files: CacheFiles, before: string | undefined): Promise<void> {
  return until(() => {
    const now = readStatus(files.status);
    return now?.state === "done" && now.started_at !== before;
  }, "the refresh to finish");
}
