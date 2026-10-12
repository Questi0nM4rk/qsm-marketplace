// The session-start decision: whether the repository holding a path is indexed, and what to do
// about it. It never waits for a build; a build it starts runs detached.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnDetached } from "../../../lib/detach.ts";
import { GRAPH_DIR, GRAPH_FILE } from "./build.ts";
import { type CacheFiles, cacheFiles, type Env } from "./paths.ts";
import { changedSet, head, topLevel } from "./repo.ts";
import type { Runner } from "./run.ts";
import { changedSince, liveHolder, readStatus } from "./state.ts";

/** A stale index of more files than this asks before it is rebuilt; a first index warns above it. */
const CONSENT_THRESHOLD = 5000;
/** Linear from a measured build of 1046 files: an estimate, since time grows with graph size. */
const MB_PER_1000_FILES = 15;
const SECONDS_PER_1000_FILES = 73;

export interface Ask {
  readonly answer: "ask";
  readonly repo: string;
  readonly files: number;
  readonly stale: boolean;
}

export type AutoAnswer =
  | { readonly answer: "started" | "fresh" | "running" | "declined"; readonly repo: string }
  | Ask
  | { readonly answer: "not-indexable" | "failed"; readonly reason: string };

export interface AutoArgs {
  readonly path: string;
  readonly consent?: "yes" | "no" | undefined;
}

/** How many files git lists, tracked or untracked and not ignored. Not through a Runner: a
 * runner caps its output, and the list is as long as the repository. */
function fileCount(top: string): number {
  const listed = spawnSync(
    "git",
    ["-C", top, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 },
  );
  return listed.stdout.split("\0").filter((file) => file.length > 0).length;
}

/** The index was built at HEAD and no file changed since. */
export function isFresh(top: string, files: CacheFiles, run: Runner): boolean {
  const status = readStatus(files.status);
  return (
    status !== null &&
    status.state === "done" &&
    status.result !== "failed" &&
    status.built_at_commit === head(top, run) &&
    changedSince(status.changed_at_build, changedSet(top, run)) === 0
  );
}

/** Records the person's answer, when one is given, and says whether a no stands: a no writes the
 * marker, a yes removes it. */
function isDeclined(files: CacheFiles, consent: AutoArgs["consent"]): boolean {
  if (consent === "no") {
    mkdirSync(files.dir, { recursive: true });
    writeFileSync(files.declined, "");
  } else if (consent === "yes") {
    rmSync(files.declined, { force: true });
  }
  return existsSync(files.declined);
}

/** Starts `qsm-index build` detached with the build log replaced, one build's output; null when
 * started, else why not. */
export function spawnBuild(repo: string, files: CacheFiles, env: Env): string | null {
  mkdirSync(files.dir, { recursive: true });
  return spawnDetached("qsm-index", ["build", repo], { file: files.log, append: false }, env);
}

/** In this order: not a git repository, declined, running, fresh. Otherwise a repository with no
 * index asks, a stale one above the threshold asks, and a stale one at or under it starts a
 * detached build. `consent` is the person's answer to an ask: a no is remembered, a yes builds. */
export function auto(args: AutoArgs, run: Runner, env: Env): AutoAnswer {
  const top = topLevel(args.path, run);
  if (!top.ok) {
    return { answer: "not-indexable", reason: `${args.path} is not inside a git repository` };
  }
  const repo = top.stdout;
  const files = cacheFiles(repo, env);
  if (isDeclined(files, args.consent)) {
    return { answer: "declined", repo };
  }
  if (liveHolder(files.lock) !== null) {
    return { answer: "running", repo };
  }
  const indexed = existsSync(join(repo, GRAPH_DIR, GRAPH_FILE));
  if (indexed && isFresh(repo, files, run)) {
    return { answer: "fresh", repo };
  }
  if (args.consent !== "yes") {
    const count = fileCount(repo);
    if (!indexed || count > CONSENT_THRESHOLD) {
      return { answer: "ask", repo, files: count, stale: indexed };
    }
  }
  const failure = spawnBuild(repo, files, env);
  return failure === null ? { answer: "started", repo } : { answer: "failed", reason: failure };
}

/** What the agent is told for an ask: what was found, the question, and the two answers. */
export function askText(a: Ask): string {
  const found = a.stale
    ? `The qsm-index map of ${a.repo} is stale`
    : `${a.repo} has no qsm-index map yet`;
  const mb = Math.round((a.files * MB_PER_1000_FILES) / 1000);
  const s = Math.round((a.files * SECONDS_PER_1000_FILES) / 1000);
  const large = a.files > CONSENT_THRESHOLD ? "; WARNING: it will be large" : "";
  return (
    `${found} (${a.files} files, about ${mb} MB and ${s} s to build${large}). ` +
    `Ask the person with AskUserQuestion whether to ${a.stale ? "reindex" : "index"} it. ` +
    `Yes: run \`qsm-index auto ${a.repo} --consent yes\`; no: run \`qsm-index auto ${a.repo} --consent no\`.`
  );
}
