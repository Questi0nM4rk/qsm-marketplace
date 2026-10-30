// The lookups, as plain functions. The CLI and the MCP server both reach them through `TOOLS`.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { auto, isFresh, spawnBuild } from "./auto.ts";
import { GRAPH_DIR, GRAPH_FILE } from "./build.ts";
import { type CacheFiles, cacheFiles, type Env } from "./paths.ts";
import { changedSet, commitsSince, head, topLevel } from "./repo.ts";
import type { Runner } from "./run.ts";
import { type BuildStatus, changedSince, type Lock, liveHolder, readStatus } from "./state.ts";
import { enclosing, readGraph, symbolsOf } from "./symbols.ts";

export interface ToolOutcome {
  readonly ok: boolean;
  readonly text: string;
}

const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 20;

function ok(text: string): ToolOutcome {
  return { ok: true, text };
}

function failed(message: string): ToolOutcome {
  return { ok: false, text: message };
}

/** The top level of the git repository holding an absolute path that is there, or the reason
 * there is none. */
function repository(value: string, label: string, run: Runner): string | ToolOutcome {
  if (!isAbsolute(value)) {
    return failed(`${label} must be an absolute path, got ${value}`);
  }
  const path = resolve(value);
  if (!existsSync(path)) {
    return failed(`${label} does not exist: ${path}`);
  }
  const top = topLevel(path, run);
  return top.ok ? top.stdout : failed(top.detail);
}

interface GraphRef {
  readonly repo: string;
  readonly graph: string;
}

function isOutcome(value: object | string): value is ToolOutcome {
  return typeof value === "object" && "text" in value;
}

export interface SearchArgs {
  readonly path: string;
  readonly query: string;
  readonly top_k?: number | undefined;
}

/** semble reads `.gitignore`, not the git exclude file the graph directory is hidden by, so it
 * indexes the graph's own report; its chunks answer no question about the code. */
function withoutGraphOutput(text: string): string {
  const graphChunk = /^## \d+\. graphify-out\//;
  return text
    .split(/^(?=## \d+\. )/m)
    .filter((part) => !graphChunk.test(part))
    .join("");
}

/** Semantic and keyword lookup over one repository. */
export function search(args: SearchArgs, run: Runner): ToolOutcome {
  const path = repository(args.path, "path", run);
  if (isOutcome(path)) {
    return path;
  }
  if (args.query.trim().length === 0) {
    return failed("query is required");
  }
  const topK = Math.min(Math.max(Math.trunc(args.top_k ?? DEFAULT_TOP_K), 1), MAX_TOP_K);
  const result = run("semble", ["search", "-k", String(topK), args.query, path]);
  return result.ok ? ok(withoutGraphOutput(result.stdout).trim()) : failed(result.detail);
}

type StructureOp = "explain" | "path";

export interface StructureArgs {
  readonly repo: string;
  readonly op: StructureOp;
  readonly node: string;
  readonly to?: string | undefined;
}

/** What a graph read did about an index that is stale or absent: a stale one within the
 * threshold is rebuilt in the background; a first index is never started by a read. */
function refresh(repo: string, run: Runner, env: Env): string {
  const decided = auto({ path: repo }, run, env);
  switch (decided.answer) {
    case "started":
      return "reindex started";
    case "running":
      return "reindex running";
    case "failed":
    case "not-indexable":
      return `reindex could not start: ${decided.reason}`;
    case "ask":
    case "declined":
    case "fresh":
      break;
  }
  return "run reindex";
}

function commitsBehind(repo: string, built: string | null, run: Runner): string {
  const n = built === null ? null : commitsSince(repo, built, run);
  return `${n ?? "an unknown number of"} commits behind HEAD`;
}

/** The first line of every graph answer from a stale index, or null for a fresh one. */
function stalenessLine(repo: string, run: Runner, env: Env): string | null {
  return isFresh(repo, cacheFiles(repo, env), run)
    ? null
    : `index is stale; ${refresh(repo, run, env)}`;
}

/** The repository and its graph file, or the reason a graph read cannot go on. */
function graphOf(value: string, label: string, run: Runner, env: Env): GraphRef | ToolOutcome {
  const repo = repository(value, label, run);
  if (isOutcome(repo)) {
    return repo;
  }
  const graph = join(repo, GRAPH_DIR, GRAPH_FILE);
  return existsSync(graph)
    ? { repo, graph }
    : failed(`no structural index of ${repo}; ${refresh(repo, run, env)}`);
}

/** A read of the structural graph: the graph and the one argument the read cannot answer
 * without are checked, then `answer` runs, and its outcome leads with the staleness line when the
 * index is stale. */
function graphRead(
  from: { readonly repo: string; readonly name: string; readonly value: string },
  run: Runner,
  env: Env,
  answer: (found: GraphRef) => ToolOutcome,
): ToolOutcome {
  const found = graphOf(from.repo, "repo", run, env);
  if (isOutcome(found)) {
    return found;
  }
  if (from.value.trim().length === 0) {
    return failed(`${from.name} is required`);
  }
  const line = stalenessLine(found.repo, run, env);
  const answered = answer(found);
  return line === null ? answered : { ok: answered.ok, text: `${line}\n${answered.text}` };
}

/** Node and path questions over a repository the structural grapher has indexed. */
export function structure(args: StructureArgs, run: Runner, env: Env): ToolOutcome {
  return graphRead({ repo: args.repo, name: "node", value: args.node }, run, env, (found) => {
    if (args.op === "path" && (args.to ?? "").trim().length === 0) {
      return failed("'to' is required for op=path");
    }
    const answered =
      args.op === "path"
        ? run("graphify", ["path", args.node, args.to ?? "", "--graph", found.graph])
        : run("graphify", ["explain", args.node, "--graph", found.graph]);
    return answered.ok ? ok(answered.stdout.trim()) : failed(answered.detail);
  });
}

export interface ImpactArgs {
  readonly repo: string;
  readonly node: string;
  readonly depth?: number | undefined;
}

const DEFAULT_DEPTH = 2;

/** `graphify affected` has no verdict of its own for a node it knows and nothing depends on, or for
 * one it cannot match; its two sentences are read here. */
function impactAnswer(graphFile: string, node: string, depth: number, run: Runner): ToolOutcome {
  const answered = run("graphify", [
    "affected",
    node,
    "--depth",
    String(depth),
    "--graph",
    graphFile,
  ]);
  if (!answered.ok) {
    return failed(answered.detail);
  }
  const text = answered.stdout.trim();
  if (text.startsWith("No unique node match")) {
    return failed(`${node} matches no single node of the graph`);
  }
  if (text.includes("No affected nodes found.")) {
    return ok(
      `unknown: nothing in the graph depends on ${node}; the graph may miss dynamic or cross-language uses`,
    );
  }
  return ok(text);
}

/** The nodes that depend on a node, by a reverse walk of the graph. Never answers "safe". */
export function impact(args: ImpactArgs, run: Runner, env: Env): ToolOutcome {
  const depth = Math.max(Math.trunc(args.depth ?? DEFAULT_DEPTH), 1);
  return graphRead({ repo: args.repo, name: "node", value: args.node }, run, env, (found) =>
    impactAnswer(found.graph, args.node, depth, run),
  );
}

export interface ContextArgs {
  readonly repo: string;
  readonly target: string;
}

const FILE_AND_LINE = /^(.+):(\d+)$/;

/** The symbols of a file, and with a line the enclosing symbol and the chunks related to it. */
export function context(args: ContextArgs, run: Runner, env: Env): ToolOutcome {
  return graphRead({ repo: args.repo, name: "target", value: args.target }, run, env, (found) => {
    const split = FILE_AND_LINE.exec(args.target);
    const path = split?.[1] ?? args.target;
    const file = isAbsolute(path) ? relative(found.repo, path) : path;
    const line = split === null ? null : Number(split[2]);
    const symbols = symbolsOf(readGraph(found.graph), file);
    if (symbols.length === 0) {
      return failed(`no node of ${file} in the graph`);
    }
    const inside = line === null ? undefined : enclosing(symbols, line);
    const lines = symbols.map(
      (symbol) =>
        `L${symbol.line} ${symbol.label}${symbol === inside ? "  <- encloses the line" : ""}`,
    );
    if (line === null) {
      lines.push("add :<line> to the file for the chunks related to it");
    } else {
      const related = run("semble", ["find-related", file, String(line), found.repo]);
      lines.push(
        related.ok
          ? `related to ${file}:${line}:\n${related.stdout.trim()}`
          : `related chunks unavailable: ${related.detail}`,
      );
    }
    return ok(lines.join("\n"));
  });
}

export interface RepoArgs {
  readonly path: string;
}

/** `answer` for the repository holding a path and its cache files, or the reason there is none. */
function withRepo(
  path: string,
  run: Runner,
  env: Env,
  answer: (repo: string, files: CacheFiles) => ToolOutcome,
): ToolOutcome {
  const repo = repository(path, "path", run);
  return isOutcome(repo) ? repo : answer(repo, cacheFiles(repo, env));
}

/** Starts `qsm-index build` of the repository detached and returns at once, unless a live build
 * already holds its lock. */
function startBuild(repo: string, files: CacheFiles, env: Env): ToolOutcome {
  const holder = liveHolder(files.lock);
  if (holder !== null) {
    return ok(`a build of ${repo} is already running since ${holder.started_at}`);
  }
  const failure = spawnBuild(repo, files, env);
  return failure === null ? ok(`started a build of ${repo}`) : failed(failure);
}

/** Distinct edited files that start a refresh. */
const EDIT_THRESHOLD = 20;

/** The top level of the repository holding `dir` and its cache files, when a hook may refresh it:
 * only a repository that already has an index the person did not decline, so a hook never
 * overrides the session-start question or a no. */
function refreshable(
  dir: string,
  run: Runner,
  env: Env,
): { readonly repo: string; readonly files: CacheFiles } | null {
  const top = topLevel(dir, run);
  if (!top.ok) {
    return null;
  }
  const files = cacheFiles(top.stdout, env);
  if (existsSync(files.declined) || !existsSync(join(top.stdout, GRAPH_DIR, GRAPH_FILE))) {
    return null;
  }
  return { repo: top.stdout, files };
}

/** Adds `file` to the count in the cache's `edits` file (each call is a fresh process; a build
 * empties it); the new count, or null when it was counted already. */
function countEdit(files: CacheFiles, file: string): number | null {
  const counted = existsSync(files.edits)
    ? readFileSync(files.edits, "utf8")
        .split("\n")
        .filter((line) => line !== "")
    : [];
  if (counted.includes(file)) {
    return null;
  }
  mkdirSync(files.dir, { recursive: true });
  appendFileSync(files.edits, `${file}\n`);
  return counted.length + 1;
}

/** A hook's refresh: started, or the one line that says why it could not start. */
function hookRefresh(repo: string, files: CacheFiles, env: Env): ToolOutcome {
  const started = startBuild(repo, files, env);
  return started.ok
    ? started
    : failed(`qsm-index could not start a background build: ${started.text}`);
}

function noRefresh(path: string): ToolOutcome {
  return ok(`no refresh: ${path} is not in an indexed repository the person did not decline`);
}

export interface ReindexArgs extends RepoArgs {
  /** Refresh only a repository that has an index the person did not decline (`refreshable`). */
  readonly ifIndexed?: boolean | undefined;
}

/** The detached build of the repository holding a path; with `ifIndexed`, only of one a hook may
 * refresh, and nothing otherwise. */
export function reindex(args: ReindexArgs, run: Runner, env: Env): ToolOutcome {
  if (args.ifIndexed !== true) {
    return withRepo(args.path, run, env, (repo, files) => startBuild(repo, files, env));
  }
  const target = refreshable(args.path, run, env);
  return target === null ? noRefresh(args.path) : hookRefresh(target.repo, target.files, env);
}

export interface EditedArgs {
  readonly path: string;
  /** What a relative `path` is resolved against; the process's working directory by default. */
  readonly cwd?: string | undefined;
}

/** Counts one edited file towards the refresh of the indexed repository holding it, and starts
 * the refresh at the EDIT_THRESHOLD-th distinct file. */
export function edited(args: EditedArgs, run: Runner, env: Env): ToolOutcome {
  const file = resolve(args.cwd ?? process.cwd(), args.path);
  const target = refreshable(dirname(file), run, env);
  if (target === null) {
    return noRefresh(file);
  }
  const count = countEdit(target.files, file);
  if (count === null) {
    return ok(`${file} is counted already`);
  }
  return count < EDIT_THRESHOLD
    ? ok(`${count} of ${EDIT_THRESHOLD} edited files counted towards a refresh of ${target.repo}`)
    : hookRefresh(target.repo, target.files, env);
}

/** The commit the index was built at against HEAD, and the files changed since. */
function freshness(repo: string, last: BuildStatus, run: Runner): string[] {
  const built = last.built_at_commit;
  let behind = "at HEAD";
  if (built === null) {
    behind = "no commit";
  } else if (built !== head(repo, run)) {
    behind = commitsBehind(repo, built, run);
  }
  const changed = changedSince(last.changed_at_build, changedSet(repo, run));
  return [
    `built at ${built ?? "no commit"}, ${behind}`,
    `${changed} files changed since the build`,
  ];
}

function lastBuild(last: BuildStatus | null, running: boolean): string[] {
  if (last === null) {
    return ["last build: none"];
  }
  if (last.state === "running") {
    return running ? [] : ["last build: did not finish"];
  }
  const cause = last.cause === null ? "" : `: ${last.cause}`;
  return [`last build: ${last.result} in ${last.duration_ms} ms${cause}`];
}

/** Whether the index is there, how far behind it is, whether a build runs, and how the last one
 * ended. Reads only; it never starts a build. */
export function status(args: RepoArgs, run: Runner, env: Env): ToolOutcome {
  return withRepo(args.path, run, env, (repo, files) => {
    const last = readStatus(files.status);
    const holder = liveHolder(files.lock);
    const present = existsSync(join(repo, GRAPH_DIR, GRAPH_FILE));
    return ok(
      [
        `index of ${repo}: ${present ? "present" : "absent"}`,
        ...(last === null ? [] : freshness(repo, last, run)),
        holder === null
          ? "build: not running"
          : `build: running, phase ${last?.phase ?? "graph"}, ${runningFor(holder, Date.now())}`,
        ...lastBuild(last, holder !== null),
      ].join("\n"),
    );
  });
}

/** How long `wait` looks for a build to appear after `since`: a detached build takes its lock a
 * moment after it was started. It bounds the search for a build, never the build itself. */
const APPEAR_MS = 60_000;

export interface WaitArgs extends RepoArgs {
  /** When the caller started or asked for the build, as an ISO time. */
  readonly since: string;
}

/** How a finished build ended, in the line the person and the agent are told. */
function ended(repo: string, last: BuildStatus): ToolOutcome {
  if (last.result === "failed" || last.state === "running") {
    return failed(`qsm-index: build of ${repo} failed: ${last.cause ?? "it did not finish"}`);
  }
  const at = (last.built_at_commit ?? "no commit").slice(0, 12);
  const took = Math.round((last.duration_ms ?? 0) / 1000);
  const partial = last.result === "partial" ? `; semantic pass failed: ${last.cause}` : "";
  return ok(`qsm-index: ${repo} indexed at ${at} in ${took} s${partial}`);
}

/** How often `wait` says a build still runs, so a hung one is seen; a report, never a limit. */
const RUNNING_REPORT_MS = 600_000;

/** A running build as the person reads it: how long it has run and the process to kill. */
function runningFor(holder: Lock, now: number): string {
  const minutes = Math.floor((now - Date.parse(holder.started_at)) / 60_000);
  return `for ${minutes} min (pid ${holder.pid})`;
}

/** One look at the cache: the answer once the awaited build ended, else the build still running
 * (`holder`). A build is the awaited one when it was seen running or started or ended after
 * `since`; none within APPEAR_MS of `since` is a failure, because the caller was told one runs. */
function waitLook(repo: string, files: CacheFiles, args: WaitArgs, since: number, seen: boolean) {
  const holder = liveHolder(files.lock);
  if (holder !== null) {
    return { seen: true, holder, answer: null };
  }
  const last = readStatus(files.status);
  const after = (time: string | null) => time !== null && Date.parse(time) >= since;
  if (last !== null && (seen || after(last.started_at) || after(last.finished_at))) {
    return { seen, holder, answer: ended(repo, last) };
  }
  const none = failed(`qsm-index: no build of ${repo} ran after ${args.since}; see ${files.log}`);
  return { seen, holder, answer: !seen && Date.now() - since > APPEAR_MS ? none : null };
}

/** Waits for the build of the repository holding a path that runs now, starts or ends within
 * APPEAR_MS of `since`, and says how it ended. `say` hears the repository first, then every
 * RUNNING_REPORT_MS how long the build has run. No limit: the build takes what it takes. */
export async function waitBuild(
  args: WaitArgs,
  run: Runner,
  env: Env,
  say: (line: string) => void,
  pollMs = 1000,
): Promise<ToolOutcome> {
  const repo = repository(args.path, "path", run);
  if (isOutcome(repo)) {
    return repo;
  }
  const since = Date.parse(args.since);
  if (Number.isNaN(since)) {
    return failed(`since: ${args.since} is not an ISO time`);
  }
  say(`waiting for ${repo}`);
  const files = cacheFiles(repo, env);
  let reported = Date.now();
  let look = waitLook(repo, files, args, since, false);
  while (look.answer === null) {
    if (look.holder !== null && Date.now() - reported >= RUNNING_REPORT_MS) {
      reported = Date.now();
      say(`qsm-index: build of ${repo} running ${runningFor(look.holder, reported)}`);
    }
    await Bun.sleep(pollMs);
    look = waitLook(repo, files, args, since, look.seen);
  }
  return look.answer;
}

type ToolArgs = Readonly<Record<string, unknown>>;

function stringArg(args: ToolArgs, name: string): string | undefined {
  const value = args[name];
  return typeof value === "string" ? value : undefined;
}

/** Every tool by its name, which is both its MCP tool name and its qsm.json verb. The interface
 * that parsed the arguments already checked them against qsm.json. */
export const TOOLS: Readonly<
  Record<string, (args: ToolArgs, run: Runner, env: Env) => ToolOutcome>
> = {
  search: (args, run) =>
    search(
      {
        path: stringArg(args, "path") ?? "",
        query: stringArg(args, "query") ?? "",
        top_k: typeof args.top_k === "number" ? args.top_k : undefined,
      },
      run,
    ),
  structure: (args, run, env) =>
    structure(
      {
        repo: stringArg(args, "repo") ?? "",
        op: args.op === "path" ? "path" : "explain",
        node: stringArg(args, "node") ?? "",
        to: stringArg(args, "to"),
      },
      run,
      env,
    ),
  impact: (args, run, env) =>
    impact(
      {
        repo: stringArg(args, "repo") ?? "",
        node: stringArg(args, "node") ?? "",
        depth: typeof args.depth === "number" ? args.depth : undefined,
      },
      run,
      env,
    ),
  context: (args, run, env) =>
    context(
      { repo: stringArg(args, "repo") ?? "", target: stringArg(args, "target") ?? "" },
      run,
      env,
    ),
  reindex: (args, run, env) =>
    reindex({ path: stringArg(args, "path") ?? "", ifIndexed: args.ifIndexed === true }, run, env),
  status: (args, run, env) => status({ path: stringArg(args, "path") ?? "" }, run, env),
};
