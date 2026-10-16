// One foreground build of a repository's map, guarded by the lock and reported in the status file.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { QsmError } from "../../../lib/qsm-error.ts";
import { type CacheFiles, cacheFiles, cacheRoot, type Env } from "./paths.ts";
import { changedSet, excludeFile, head, topLevel } from "./repo.ts";
import type { Runner } from "./run.ts";
import {
  type BuildResult,
  type BuildStatus,
  errnoCode,
  releaseLock,
  takeLock,
  writeStatus,
} from "./state.ts";

export const GRAPH_DIR = "graphify-out";
export const GRAPH_FILE = "graph.json";

export interface BuildDeps {
  readonly cwd: string;
  readonly run: Runner;
  readonly env: Env;
}

export type BuildReport =
  | { readonly kind: "running"; readonly repo: string; readonly started_at: string }
  | {
      readonly kind: "built";
      readonly repo: string;
      readonly result: BuildResult;
      readonly cause: string | null;
      readonly built_at_commit: string | null;
      readonly graph_path: string | null;
      readonly warning: string | null;
    };

/** True only for a directory we can actually stat. */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** The top level of the git repository holding `path`, or a `missing` QsmError: there is nothing to index. */
function indexableRepo(path: string, deps: BuildDeps): string {
  const absPath = isAbsolute(path) ? resolve(path) : resolve(deps.cwd, path);
  if (!existsSync(absPath)) {
    throw new QsmError("missing", `path does not exist: ${absPath}`);
  }
  if (!isDirectory(absPath)) {
    throw new QsmError("missing", `path is not a directory: ${absPath}`);
  }
  const top = topLevel(absPath, deps.run);
  if (!top.ok) {
    throw new QsmError("missing", `path is not inside a git repository: ${absPath}: ${top.detail}`);
  }
  return top.stdout;
}

/** Makes `<repo>/graphify-out` a symlink to the cache target, the target first so the link never
 * dangles. A real directory and the right link stay; a link into another cache directory (the
 * repository moved) is pointed again; any other link is someone's choice, left alone and named. */
function linkGraph(repo: string, files: CacheFiles, env: Env): string | null {
  mkdirSync(files.graph, { recursive: true });
  const link = join(repo, GRAPH_DIR);
  let target: string;
  try {
    target = resolve(repo, readlinkSync(link));
  } catch (cause) {
    const code = errnoCode(cause);
    if (code === "ENOENT") {
      symlinkSync(files.graph, link);
      return null;
    }
    if (code === "EINVAL") {
      // a real directory
      return null;
    }
    throw cause;
  }
  if (target === files.graph) {
    return null;
  }
  if (basename(target) === GRAPH_DIR && dirname(dirname(target)) === cacheRoot(env)) {
    rmSync(link);
    symlinkSync(files.graph, link);
    return null;
  }
  return `${link} links to ${target}, not into the cache; left alone`;
}

/** Appends `graphify-out` to the exclude file git names, unless a line already says it. Outside
 * git there is no exclude file, and nothing to do. */
function excludeGraph(repo: string, run: Runner): void {
  const file = excludeFile(repo, run);
  if (file === null) {
    return;
  }
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (text.split("\n").includes(GRAPH_DIR)) {
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  const separator = text.length === 0 || text.endsWith("\n") ? "" : "\n";
  appendFileSync(file, `${separator}${GRAPH_DIR}\n`);
}

/** The graph link and the exclude line, then graphify, then semble, each phase written to the
 * status file before it runs. */
function pass(repo: string, files: CacheFiles, deps: BuildDeps): BuildReport {
  const warning = linkGraph(repo, files, deps.env);
  excludeGraph(repo, deps.run);
  const started = new Date();
  let status: BuildStatus = {
    repo,
    state: "running",
    phase: "graph",
    started_at: started.toISOString(),
    finished_at: null,
    duration_ms: null,
    result: null,
    cause: null,
    built_at_commit: head(repo, deps.run),
    changed_at_build: changedSet(repo, deps.run),
    warning,
  };
  writeStatus(files.status, status);
  const graphJson = join(repo, GRAPH_DIR, GRAPH_FILE);
  const finish = (result: BuildResult, cause: string | null): BuildReport => {
    const finished = new Date();
    status = {
      ...status,
      state: "done",
      phase: null,
      finished_at: finished.toISOString(),
      duration_ms: finished.getTime() - started.getTime(),
      result,
      cause,
    };
    writeStatus(files.status, status);
    return {
      kind: "built",
      repo,
      result,
      cause,
      built_at_commit: status.built_at_commit,
      graph_path: result === "failed" ? null : graphJson,
      warning,
    };
  };

  const graphed = deps.run("graphify", ["update", repo]);
  if (!graphed.ok) {
    return finish("failed", graphed.detail);
  }
  if (!existsSync(graphJson)) {
    return finish("failed", `graphify wrote no ${graphJson}`);
  }
  status = { ...status, phase: "semantic" };
  writeStatus(files.status, status);
  const searched = deps.run("semble", ["search", "entry point", repo, "--top-k", "1"]);
  return searched.ok ? finish("ok", null) : finish("partial", searched.detail);
}

/** Build the map of the repository holding `path`, unless a live build already holds its lock. */
export function buildIndex(path: string, deps: BuildDeps): BuildReport {
  const repo = indexableRepo(path, deps);
  const files = cacheFiles(repo, deps.env);
  const lock = takeLock(files.lock, new Date());
  if (!lock.taken) {
    return { kind: "running", repo, started_at: lock.holder.started_at };
  }
  // A build starts: the edits it will see no longer count towards the next one.
  rmSync(files.edits, { force: true });
  try {
    return pass(repo, files, deps);
  } finally {
    releaseLock(files.lock);
  }
}
