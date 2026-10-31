// Every checker compares a reference tree against the tree being shipped, and passes only when the
// second is no worse.

import { type SpawnSyncReturns, spawn as spawnChild } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generatedPaths,
  gitPaths,
  languageEnabled,
  matchingFiles,
  pathsWithAttr,
  trackedFiles,
} from "./config.ts";
import { changedPlusSet, describeSets, givenSet, type SetSize, setName } from "./file-sets.ts";
import type { Finding, Tally } from "./findings.ts";
import { isErrno } from "./errors.ts";
import { hasScaffoldedConfig } from "./profiles.ts";
import { recordTimings, slowLines, type Timing } from "./timings.ts";
import {
  asRunAt,
  type CheckSpec,
  installLine,
  JOBS,
  type Language,
  type LocalRules,
  type Point,
  POINTS,
  storePointOf,
  REGISTRY,
  selectedAt,
} from "./registry.ts";
import {
  configHash,
  contentHash,
  describeStore,
  type Keying,
  ResultStore,
  type Score,
  type SideUse,
  type StoreReport,
  type StoreUse,
} from "./result-store.ts";
import {
  type FetchPack,
  fetchFromRegistry,
  PACKS_SCRATCH_PREFIX,
  type ResolvedPack,
  resolvePacks,
} from "./rule-packs.ts";
import { withCommitTree, withScratchDir, withWorktreeTree } from "./tree.ts";

const REPORT_SCRATCH_PREFIX = "qsm-langdev-report-";

/** Every tracked file the working tree holds, minus anything deleted on disk. An untracked
 * file is not on its way into a commit, so it is not measured. Empty when git could not answer. */
function worktreePaths(root: string): string[] {
  const paths = gitPaths(root, ["ls-files", "-z", "--cached"]);
  if (paths === null) {
    return [];
  }
  return paths.filter((path) => existsSync(join(root, path)));
}

/** What a checker is handed to score: a directory holding a whole tree and
 * the paths under it a checker may cover. */
interface Side {
  root: string;
  files: readonly string[];
}

/** Hands `fn` the tree at `ref`: a scratch materialization of the working
 * tree (never the live directory itself — an ignored path such as
 * node_modules/ or dist/ must never enter a score just because it sits on
 * disk), or a scratch copy of a commit. Either way removed once `fn`
 * settles. */
function withSide<T>(root: string, ref: string, fn: (side: Side) => Promise<T>): Promise<T> {
  const files = sidePaths(root, ref);
  if (files === null) {
    throw new Error(`git could not list the tree at ${ref}`);
  }
  if (ref === "worktree") {
    return withWorktreeTree(root, (dir) => fn({ root: dir, files }));
  }
  return withCommitTree(root, ref, (dir) => fn({ root: dir, files }));
}

/** Every path the tree at `ref` holds, or null when git could not list it. */
function sidePaths(root: string, ref: string): string[] | null {
  return ref === "worktree"
    ? worktreePaths(root)
    : gitPaths(root, ["ls-tree", "-r", "-z", "--name-only", ref]);
}

type Spawned = Pick<SpawnSyncReturns<string>, "status" | "signal" | "error" | "stdout" | "stderr">;

/** How long a process outside any point may run before it counts as stuck: doctor's and the
 * structural checker's `--version` probes. The commit's timeout, the same five minutes. */
const PROBE_MS = POINTS["pre-commit"].timeoutMs;

function spawnAsync(
  cwd: string,
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<Spawned> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawnChild(command, args, { cwd, detached: true });
    let stdout = "";
    let stderr = "";
    let error: NodeJS.ErrnoException | undefined;
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      error = Object.assign(new Error(`${command} timed out`), { code: "ETIMEDOUT" });
      // The launcher can exit while its engine keeps scanning. This group belongs to this run.
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (cause) {
          if (!isErrno(cause) || cause.code !== "ESRCH") {
            rejectPromise(new Error(`could not stop ${command}'s process group`, { cause }));
          }
        }
      }
    }, timeoutMs);
    child.on("error", (err: NodeJS.ErrnoException) => {
      error = err;
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolvePromise({ status, signal, stdout, stderr, ...(error === undefined ? {} : { error }) });
    });
  });
}

/** `fn` over `items` with at most `limit` in flight, results in item order. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const queue = items.entries();
  const worker = async (): Promise<void> => {
    for (const [index, item] of queue) {
      results[index] = await fn(item, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Why a run gave no output to read. */
interface SpawnFailure {
  reason: string;
  timedOut?: true;
  failedRun?: true;
}

function noStatus(binary: string): SpawnFailure {
  return { reason: `${binary} exited with no status`, failedRun: true };
}

/** The exit status of a run that finished normally, else why it did not. */
function spawnStatus(result: Spawned, binary: string): number | SpawnFailure {
  if (result.error) {
    const code = isErrno(result.error) ? result.error.code : undefined;
    if (code === "ENOENT") {
      return { reason: `${binary} not on PATH` };
    }
    if (code === "ETIMEDOUT") {
      return { reason: `${binary} timed out`, timedOut: true };
    }
    return { reason: `${binary} could not run (${code ?? result.error.message})`, failedRun: true };
  }
  if (result.signal) {
    return { reason: `${binary} killed by ${result.signal}`, failedRun: true };
  }
  if (result.status === null) {
    return noStatus(binary);
  }
  return result.status;
}

function spawnFailure(result: Spawned, binary: string): SpawnFailure | null {
  const status = spawnStatus(result, binary);
  return typeof status === "number" ? null : status;
}

/** Tool output names a file however it likes; one form, relative to the
 * root, so both sides and the rename map agree. */
function relativeTo(root: string, path: string): string {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  let out = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  while (out.startsWith("./")) {
    out = out.slice(2);
  }
  return out;
}

function normalise(value: number | Tally, root: string): Tally {
  if (typeof value === "number") {
    return { total: value };
  }
  const findings =
    value.findings === undefined
      ? {}
      : {
          findings: value.findings.map((f): Finding => ({
            identity: f.identity,
            locations: f.locations.map((l) => ({ ...l, path: relativeTo(root, l.path) })),
          })),
        };
  if (value.byPath === undefined) {
    return { total: value.total, ...findings };
  }
  const byPath: Record<string, number> = {};
  for (const [path, count] of Object.entries(value.byPath)) {
    const key = relativeTo(root, path);
    byPath[key] = (byPath[key] ?? 0) + count;
  }
  return { total: value.total, byPath, ...findings };
}

/** A checker's own words with the scratch tree's path taken out of them. */
function repoRelative(output: string, root: string): string {
  return output.split(`${root}/`).join("");
}

/** One spawn of one checker over one side. `binary` is not a parameter: it
 * is always the spec's, and passing both invites the pair to disagree. */
interface OneRun {
  spec: CheckSpec;
  root: string;
  args: string[];
  timeoutMs: number;
  readReport?: () => string;
  where?: string;
}

/** The repository's own copy of an npm tool wins over whatever PATH holds:
 * `bun run lint` runs node_modules/.bin/oxlint, so the gate must run the same
 * binary or the two disagree: a system copy of another version reports on files
 * the pinned one passes. The scratch tree links node_modules in, so the
 * lookup works on both sides of a comparison. */
export function resolveBinary(root: string, binary: string): string {
  const local = join(root, "node_modules", ".bin", binary);
  return existsSync(local) ? local : binary;
}

async function readOne(run: OneRun): Promise<Score> {
  const { spec, root, args, timeoutMs, readReport } = run;
  const { binary } = spec;
  const where = run.where ?? "";
  const result = await spawnAsync(root, resolveBinary(root, binary), args, timeoutMs);
  const exitCode = spawnStatus(result, binary);
  if (typeof exitCode !== "number") {
    return { ...exitCode, reason: `${where}${exitCode.reason}` };
  }
  const stdout = readReport ? readReport() : (result.stdout ?? "");
  const stderr = result.stderr ?? "";
  const value = spec.count(stdout, stderr, exitCode);
  if (value === null) {
    const cause = failureCause(spec, stdout, stderr, exitCode);
    return { reason: `${where}${repoRelative(cause, root)}`, failedRun: true };
  }
  return { tally: normalise(value, root), output: repoRelative(`${stdout}\n${stderr}`, root) };
}

const CAUSE_MAX_CHARS = 200;

/**
 * Why a run gave output its parser could not read: where the tool names it, else the first line of
 * its stderr that says anything (not blank, not box drawing), else the bare fact with the exit
 * code.
 */
function failureCause(spec: CheckSpec, stdout: string, stderr: string, exitCode: number): string {
  const lines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /[\p{L}\p{N}]/u.test(line));
  // A Python crash opens with "Traceback" and names its exception on the last line.
  const said =
    spec.failure?.(stdout) ??
    (lines[0]?.startsWith("Traceback") === true ? lines.at(-1) : lines[0]);
  if (said === undefined) {
    return `unreadable ${spec.binary} output (exit ${exitCode})`;
  }
  return said.length > CAUSE_MAX_CHARS ? `${said.slice(0, CAUSE_MAX_CHARS)}…` : said;
}

function scoreWithReport(
  spec: CheckSpec,
  reportFile: string,
  side: KeptSide,
  files: readonly string[],
  timeoutMs: number,
): Promise<Score> {
  return withScratchDir(REPORT_SCRATCH_PREFIX, (reportDir) => {
    const readReport = (): string => {
      try {
        return readFileSync(join(reportDir, reportFile), "utf8");
      } catch {
        return "";
      }
    };
    const args = spec.args(files, side.root, reportDir, side.rules);
    return readOne({ spec, root: side.root, args, timeoutMs, readReport });
  });
}

/** How a checker's run is cut: by the spec's key, one file at a time, or the whole side at once. */
function groupsOf(spec: CheckSpec, side: KeptSide): readonly (readonly string[])[] {
  if (spec.groupBy === undefined) {
    return spec.eachFile === true ? side.files.map((file) => [file]) : [side.files];
  }
  const groups = new Map<string, string[]>();
  for (const file of side.files) {
    const key = spec.groupBy(side.root, file);
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }
  return [...groups.values()];
}

/** The scores of a checker's groups as one: the first failure, else the tallies summed. A
 * per-file run counts under its file and keeps no findings, as its tool names no path. */
function merged(
  groups: readonly (readonly string[])[],
  scores: readonly Score[],
  perFile: boolean,
): Score {
  let total = 0;
  const byPath: Record<string, number> = {};
  const findings: Finding[] = [];
  const outputs: string[] = [];
  for (const [index, one] of scores.entries()) {
    if (!("tally" in one)) {
      return one;
    }
    total += one.tally.total;
    const file = groups[index]?.[0];
    if (perFile && file !== undefined) {
      byPath[file] = one.tally.total;
    } else {
      Object.assign(byPath, one.tally.byPath);
      findings.push(...(one.tally.findings ?? []));
    }
    outputs.push(one.output);
  }
  return {
    tally: perFile ? { total, byPath } : { total, byPath, findings },
    output: outputs.join("\n"),
  };
}

/**
 * Where one side of one checker keeps its results: the run's store, the side's key (null when this
 * checker is never stored), and the side's count of hits and scores.
 */
interface SideStore {
  store: ResultStore;
  keying: Keying | null;
  use: SideUse;
}

/**
 * The tool's number for one side: one spawn, one per file summed, or one that writes a report
 * file, each answered from the store when it already holds that content.
 */
async function score(spec: CheckSpec, side: KeptSide, timeoutMs: number): Promise<Score> {
  if (side.files.length === 0) {
    return { tally: { total: 0, byPath: {}, findings: [] }, output: "" };
  }
  const { store, keying, use } = side.kept;
  const through = (files: readonly string[], compute: () => Promise<Score>): Promise<Score> =>
    store.through(keying, contentHash(side.root, files), compute, use);
  const argsFor = (files: readonly string[]) => spec.args(files, side.root, undefined, side.rules);
  const { reportFile } = spec;
  const perFile = spec.eachFile === true && spec.groupBy === undefined;
  const scoreOf = (files: readonly string[]): Promise<Score> =>
    reportFile === undefined
      ? readOne({
          spec,
          root: side.root,
          args: argsFor(files),
          timeoutMs,
          ...(perFile ? { where: `${files[0]}: ` } : {}),
        })
      : scoreWithReport(spec, reportFile, side, files, timeoutMs);
  const groups = groupsOf(spec, side);
  const scores = await mapLimit(groups, JOBS, (files) => through(files, () => scoreOf(files)));
  return merged(groups, scores, perFile);
}

/** After-path -> before-path, for files git sees moved between two trees. */
type Renames = ReadonlyMap<string, string>;

const EMPTY_TALLY: Tally = { total: 0, byPath: {}, findings: [] };

interface WorsePath {
  path: string;
  before: number;
  after: number;
}

function worsePaths(previous: Tally, current: Tally, renames: Renames): WorsePath[] {
  if (previous.byPath === undefined || current.byPath === undefined) {
    return [];
  }
  const out: WorsePath[] = [];
  for (const [path, after] of Object.entries(current.byPath)) {
    const before = previous.byPath[renames.get(path) ?? path] ?? 0;
    if (after > before) {
      out.push({ path, before, after });
    }
  }
  return out.toSorted((a, b) => a.path.localeCompare(b.path));
}

function occurrenceKey(finding: Finding, renames: Renames): string {
  const files = finding.locations.map((l) => renames.get(l.path) ?? l.path).toSorted();
  return [finding.identity, ...files].join("\0");
}

function describeFinding(finding: Finding): string {
  const where = finding.locations
    .map((l) => [l.path, l.line, l.column].filter((part) => part !== undefined).join(":"))
    .join(", ");
  return `${where}: ${finding.identity}`;
}

function occurrences(findings: readonly Finding[], renames: Renames): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = occurrenceKey(finding, renames);
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  return groups;
}

interface Gained {
  gained: number;
  lines: string[];
}

function newFindings(previous: Tally, current: Tally, renames: Renames): Gained | undefined {
  if (previous.findings === undefined || current.findings === undefined) {
    return undefined;
  }
  const before = occurrences(previous.findings, new Map());
  const out: Gained = { gained: 0, lines: [] };
  for (const [key, group] of occurrences(current.findings, renames)) {
    const extra = group.length - (before.get(key)?.length ?? 0);
    if (extra <= 0) {
      continue;
    }
    out.gained += extra;
    out.lines.push(...group.map(describeFinding));
  }
  return out;
}

const WORSE_SHOWN = 5;

function describeWorse(worse: readonly WorsePath[]): string {
  const shown = worse
    .slice(0, WORSE_SHOWN)
    .map((w) => `${w.path} ${w.before} -> ${w.after}`)
    .join(", ");
  const rest = worse.length - WORSE_SHOWN;
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

const MAX_LINES = 20;

function capped(lines: string[]): string[] {
  if (lines.length <= MAX_LINES) {
    return lines;
  }
  return [...lines.slice(0, MAX_LINES), `... ${lines.length - MAX_LINES} more lines`];
}

/** The lines under a verdict: every current occurrence with the new ones
 * marked, when `all` asks for it; else the new ones alone. */
function occurrenceLines(
  fresh: readonly string[],
  tally: Tally | undefined,
  all: boolean,
): string[] {
  if (!all || tally?.findings === undefined) {
    return [...fresh];
  }
  const isNew = new Set(fresh);
  return tally.findings.map(describeFinding).map((line) => (isNew.has(line) ? `+ ${line}` : line));
}

function looksLikeJson(output: string): boolean {
  return /^\s*[[{]/.test(output);
}

function linesNaming(output: string, paths: readonly string[]): string[] {
  if (paths.length === 0) {
    return [];
  }
  const MaxLineChars = 200;
  return output
    .split("\n")
    .filter((line) => paths.some((path) => line.includes(path)))
    .map((line) => (line.length > MaxLineChars ? `${line.slice(0, MaxLineChars)}…` : line));
}

/** One checker's answer. */
export interface Verdict {
  check: string;
  pass: boolean;
  summary: string;
  lines?: string[];
  missing?: true;
  missingConfig?: true;
  skipped?: true;
  notMeasured?: true;
}

export type RunCode = "ok" | "worse" | "blocked";

/** What a run's verdicts come to, and the verdicts that decide it: `worse`
 * when a measured checker fails, or a binary or a config is missing; else
 * `blocked` when a checker was not measured, since nothing can say the tree
 * is no worse; else `ok`. A tree with no reference is new, so a measured
 * count is a starting point and never worse. */
export function runOutcome(
  verdicts: readonly Verdict[],
  hasReference: boolean,
): { code: RunCode; deciding: Verdict[] } {
  const worse = verdicts.filter(
    (v) =>
      !v.pass &&
      v.notMeasured !== true &&
      (hasReference || v.missing === true || v.missingConfig === true),
  );
  if (worse.length > 0) {
    return { code: "worse", deciding: worse };
  }
  const unmeasured = verdicts.filter((v) => v.notMeasured === true);
  return unmeasured.length > 0
    ? { code: "blocked", deciding: unmeasured }
    : { code: "ok", deciding: [] };
}

function warn(line: string): void {
  process.stderr.write(`${line}\n`);
}

/** What a check run says once, before its verdicts: the file sets, each
 * warning about how it ran, and where each checker's results came from. */
export function printRunLines(
  sets: readonly SetSize[],
  warnings: readonly string[],
  store: StoreReport,
): void {
  warn(`[qsm-langdev] file sets: ${describeSets(sets)}`);
  for (const warning of warnings) {
    warn(`[qsm-langdev] warning: ${warning}`);
  }
  for (const line of store.checkers.length > 0 ? describeStore(store) : []) {
    warn(`[qsm-langdev] ${line}`);
  }
}

/** A verdict's first line as every report prints it: its summary, marked
 * `WORSE` when it failed on a measurement. */
export function headline(verdict: Verdict): string {
  const worse = !verdict.pass && verdict.notMeasured !== true;
  return `${worse ? "WORSE " : ""}${verdict.summary}`;
}

/** The files of `side` that are in `set` and of a type `spec` covers. */
function narrow(side: Side, spec: CheckSpec, set: ReadonlySet<string>): Side {
  const scoped = side.files.filter((f) => set.has(f));
  return { root: side.root, files: matchingFiles(side.root, scoped, spec.extensions, spec.names) };
}

interface CheckerResult {
  pass: boolean;
  summary: string;
  notMeasured?: true;
  /** The cause, when not measured because a run failed. */
  failedRun?: string;
  output?: string;
  lines?: string[];
  tally?: Tally;
}

/** The lines a verdict carries under its summary: the checker's own parsed
 * findings when it gave us any, else the raw output reduced to the lines
 * naming a file this change touched, and nothing at all when the check
 * passed and the caller did not ask to see everything. */
function verdictLines(
  result: CheckerResult,
  changed: readonly string[],
  all: boolean,
): string[] | undefined {
  if (result.lines !== undefined && (!result.pass || all)) {
    return capped(occurrenceLines(result.lines, result.tally, all));
  }
  if (!result.pass && result.output !== undefined && !looksLikeJson(result.output)) {
    return capped(linesNaming(result.output, changed));
  }
  return undefined;
}

/** before/after through one checker: the ratchet's whole rule. `before ===
 * null` means no previous tree exists (a repository with no commit yet). */
interface Evaluation {
  spec: CheckSpec;
  before: KeptSide | null;
  after: KeptSide;
  timeoutMs: number;
  renames: Renames;
}

/** A side narrowed to one checker, with where its results are kept and the
 * local copy of each rule pack the checker names that the run fetched. */
interface KeptSide extends Side {
  kept: SideStore;
  rules: LocalRules;
}

type Scored = Extract<Score, { tally: Tally }>;

const failedCause = (one: Score): string | undefined =>
  "reason" in one && one.failedRun === true ? one.reason : undefined;

/** A side that could not be scored: past the time limit, or a run whose
 * output could not be read, is not measured; any other reason fails. */
function unscored(name: string, current: Score, previous: Score, timeoutMs: number): CheckerResult {
  if ([current, previous].some((one) => "reason" in one && one.timedOut === true)) {
    const summary = `${name}: not measured: timed out after ${(timeoutMs / 1000).toFixed(1)}s; retry`;
    return { pass: false, notMeasured: true, summary };
  }
  const previousCause = failedCause(previous);
  const failed =
    failedCause(current) ??
    (previousCause === undefined ? undefined : `previous version: ${previousCause}`);
  if (failed !== undefined) {
    const summary = `${name}: not measured: ${failed}; retry`;
    return { pass: false, notMeasured: true, failedRun: failed, summary };
  }
  if ("reason" in current) {
    return { pass: false, summary: `${name}: ${current.reason}` };
  }
  const reason = "reason" in previous ? previous.reason : "no score";
  return { pass: false, summary: `${name}: previous version: ${reason}` };
}

async function evalChecker({
  spec,
  before,
  after,
  timeoutMs,
  renames,
}: Evaluation): Promise<CheckerResult> {
  const previousPromise: Promise<Score> =
    before === null
      ? Promise.resolve({ tally: EMPTY_TALLY, output: "" })
      : score(spec, before, timeoutMs);
  const [current, previous] = await Promise.all([score(spec, after, timeoutMs), previousPromise]);
  if (!("tally" in current && "tally" in previous)) {
    return unscored(spec.name, current, previous, timeoutMs);
  }
  return compared(spec.name, previous, current, renames);
}

/** Both sides scored: the ratchet's rule over their tallies. */
function compared(
  name: string,
  previous: Scored,
  current: Scored,
  renames: Renames,
): CheckerResult {
  const worse = worsePaths(previous.tally, current.tally, renames);
  const totals = `${name}: ${previous.tally.total} -> ${current.tally.total}`;
  const fresh = newFindings(previous.tally, current.tally, renames);
  const gained = fresh !== undefined && fresh.gained > 0;
  const notes = [
    ...(worse.length === 0 ? [] : [`worse: ${describeWorse(worse)}`]),
    ...(gained ? [`${fresh.gained} new`] : []),
  ];
  return {
    pass: current.tally.total <= previous.tally.total && worse.length === 0 && !gained,
    summary: notes.length === 0 ? totals : `${totals}; ${notes.join("; ")}`,
    output: current.output,
    tally: current.tally,
    ...(fresh === undefined ? {} : { lines: fresh.lines }),
  };
}

/**
 * The paths a comparison may score: a path marked `export-ignore` is a generated file, left out
 * of every checker's set, the safety checkers' too; it stays on disk for what imports it.
 */
function scoredPaths(root: string, paths: readonly string[]): string[] {
  if (paths.length === 0) {
    return [];
  }
  const ignored = pathsWithAttr(root, "export-ignore", ["set"], paths);
  return paths.filter((path) => !ignored.has(path));
}

function changedBetween(root: string, beforeRef: string, after: string): string[] | null {
  const range = after === "worktree" ? [beforeRef] : [beforeRef, after];
  // --no-renames: a moved file is in the set under both names.
  // Against the working tree, git diff lists every tracked file that differs from the commit,
  // a file added to the index included; an untracked file is not measured.
  const changed = gitPaths(root, ["diff", "--name-only", "-z", "--no-renames", ...range]);
  if (changed === null) {
    return null;
  }
  return scoredPaths(root, [...new Set(changed)].toSorted());
}

function renamedBetween(root: string, beforeRef: string, after: string): Renames {
  const range = after === "worktree" ? [beforeRef] : [beforeRef, after];
  const fields = gitPaths(root, ["diff", "--name-status", "-z", "-M", ...range]);
  const renames = new Map<string, string>();
  if (fields === null) {
    return renames;
  }
  for (let i = 0; i < fields.length;) {
    const status = fields[i] ?? "";
    if (/^[RC]\d*$/.test(status)) {
      const from = fields[i + 1];
      const to = fields[i + 2];
      if (from !== undefined && to !== undefined) {
        renames.set(to, from);
      }
      i += 3;
    } else {
      i += 2;
    }
  }
  return renames;
}

export interface CompareOptions {
  /** Enforcement point whose checker set runs. Default pre-commit. */
  at?: Point;
  /** Language selection, opt-in; empty/omitted enables no language checker
   * (the always-on languages run regardless). */
  languages?: readonly Language[];
  /** Test seam; production uses REGISTRY. */
  registry?: readonly CheckSpec[];
  timeoutMs?: number;
  /** Test seam; production reports a run slow over the point's target. */
  targetMs?: number;
  /** Test seam; production gives a binary's `--version` probe the point's timeout. */
  probeTimeoutMs?: number;
  jobs?: number;
  /** Score only these paths (relative to root) on both sides — the edit hook's one file. */
  only?: readonly string[];
  /** The files and directories (relative to root) the caller names: the
   * `given` set. Empty or omitted = the repository root. */
  given?: readonly string[];
  /** Under every verdict, list every current occurrence with new ones
   * marked, not only the new ones. */
  allFindings?: boolean;
  /** Test seam; production fetches from semgrep's registry. */
  fetchPack?: FetchPack;
}

type Applicable = { spec: CheckSpec } | { spec: CheckSpec; skip: string };

function applicability(
  root: string,
  spec: CheckSpec,
  changed: readonly string[],
  options: CompareOptions,
): Applicable | null {
  const covered = matchingFiles(root, changed, spec.extensions, spec.names).length;
  if (covered === 0) {
    return null;
  }
  if (!selectedAt(spec, options.at ?? "pre-commit")) {
    return null;
  }
  if (!languageEnabled(spec.language, options.languages ?? [])) {
    return {
      spec,
      skip: `${spec.name} covers ${covered} changed file(s) but language '${spec.language}' is off in .qsm-langdev/gates.json`,
    };
  }
  if (spec.appliesWhen !== undefined && !spec.appliesWhen.probe(root)) {
    return {
      spec,
      skip: `${spec.name} covers ${covered} changed file(s) but needs ${spec.appliesWhen.needs}`,
    };
  }
  return { spec };
}

/** Whether a binary runs, and the version it names: whatever `--version`
 * printed when it exited 0 having printed something, else null. A probe that
 * ran out of time says nothing about presence: `timedOut`, never `present`. */
interface Probe {
  present: boolean;
  timedOut: boolean;
  timeoutMs: number;
  version: string | null;
}

async function probeBinary(binary: string, timeoutMs: number): Promise<Probe> {
  const r = await spawnAsync(tmpdir(), binary, ["--version"], timeoutMs);
  const said = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  const timedOut = isErrno(r.error) && r.error.code === "ETIMEDOUT";
  const present = !r.error;
  return {
    present,
    timedOut,
    timeoutMs,
    version: present && r.status === 0 && said !== "" ? said : null,
  };
}

/** Every binary the selected checkers run, each probed once. */
async function probeAll(
  selected: readonly CheckSpec[],
  root: string,
  timeoutMs: number,
): Promise<ReadonlyMap<string, Probe>> {
  const binaries = [...new Set(selected.map((spec) => spec.binary))];
  const probes = await Promise.all(
    binaries.map(async (binary): Promise<[string, Probe]> => [
      binary,
      await probeBinary(resolveBinary(root, binary), timeoutMs),
    ]),
  );
  return new Map(probes);
}

/**
 * The paths a comparison scores: `options.only` verbatim, every path the tree holds when there is
 * no previous commit to diff against, or else whatever changed between the two sides.
 */
function resolveChanged(
  root: string,
  beforeRef: string | null,
  after: string,
  options: CompareOptions,
): string[] {
  if (options.only !== undefined) {
    return [...options.only];
  }
  if (beforeRef === null) {
    return trackedFiles(root) ?? [];
  }
  return changedBetween(root, beforeRef, after) ?? [];
}

interface Selection {
  selected: CheckSpec[];
  skipVerdicts: Verdict[];
}

/**
 * Every registry spec the change selects, split from the ones a changed file touches but that
 * don't run — an off language, or an unmet `appliesWhen` — each reported as its own skip verdict.
 */
function selectApplicable(
  root: string,
  registry: readonly CheckSpec[],
  changed: readonly string[],
  options: CompareOptions,
): Selection {
  const applicable = registry.map((spec) => applicability(root, spec, changed, options));
  const skipped = applicable.filter(
    (a): a is { spec: CheckSpec; skip: string } => a !== null && "skip" in a,
  );
  const selected = applicable
    .filter((a): a is { spec: CheckSpec } => a !== null && !("skip" in a))
    .map((a) => a.spec);
  const skipVerdicts: Verdict[] = skipped.map(({ spec, skip }) => ({
    check: spec.name,
    pass: true,
    skipped: true as const,
    summary: `${skip} — not run`,
  }));
  return { selected, skipVerdicts };
}

/**
 * A missing binary or a missing language config fails loud, before any tool spawns — a check that
 * cannot run must never read as a pass.
 */
function missingPrerequisiteVerdicts(
  selected: readonly CheckSpec[],
  root: string,
  probes: ReadonlyMap<string, Probe>,
): Verdict[] {
  const missingBinaryVerdicts: Verdict[] = selected
    .filter((spec) => probes.get(spec.binary)?.present !== true)
    .map((spec): Verdict => {
      const probe = probes.get(spec.binary);
      // A binary that did not answer in time may be installed and only slow
      // (a loaded machine): not measured, never missing.
      if (probe?.timedOut === true) {
        const seconds = (probe.timeoutMs / 1000).toFixed(1);
        return {
          check: spec.name,
          pass: false,
          notMeasured: true,
          summary: `${spec.name}: not measured: '${spec.binary} --version' timed out after ${seconds}s; retry`,
        };
      }
      return {
        check: spec.name,
        pass: false,
        missing: true,
        summary: `${spec.binary} is not installed — install: ${installLine(spec.install)}`,
      };
    });

  const languagesInPlay = [...new Set(selected.map((spec) => spec.language))];
  const missingConfigVerdicts: Verdict[] = languagesInPlay
    .filter((language) => !hasScaffoldedConfig(root, language))
    .map((language) => ({
      check: `${language} config`,
      pass: false,
      missingConfig: true as const,
      summary:
        `${language}: no profile-scaffolded config in this repository — run ` +
        `'qsm-langdev init', or remove '${language}' from .qsm-langdev/gates.json`,
    }));

  return [...missingBinaryVerdicts, ...missingConfigVerdicts];
}

/**
 * The paths the caller named, as found on either side: a file only the reference holds (deleted)
 * or only the shipped tree holds (added) is in the set, and each side scores the part it has.
 */
function resolveGiven(
  root: string,
  beforeRef: string | null,
  after: string,
  options: CompareOptions,
): string[] {
  const listed = [
    ...(beforeRef === null ? [] : (sidePaths(root, beforeRef) ?? [])),
    ...(sidePaths(root, after) ?? []),
  ];
  const given = scoredPaths(root, givenSet(listed, options.given ?? []));
  const { only } = options;
  return only === undefined ? given : given.filter((path) => only.includes(path));
}

/** The selected checkers as they run at the run's enforcement point. */
function engage(selected: readonly CheckSpec[], options: CompareOptions): CheckSpec[] {
  const point = options.at ?? "pre-commit";
  return selected.map((spec) => asRunAt(spec, point));
}

/** Every set a selected checker declares, by name, each computed once:
 * `changed` and `given` are handed in; every `changed+N` is built here from
 * the import graph of both sides and narrowed to `only` when it is set.
 * The sizes of the `changed+N` sets are pushed onto `sizes`. */
async function setsFor(
  base: {
    root: string;
    changed: readonly string[];
    given: readonly string[];
    only?: readonly string[];
  },
  selected: readonly CheckSpec[],
  trees: readonly Side[],
  sizes: SetSize[],
): Promise<Map<string, ReadonlySet<string>>> {
  const sets = new Map<string, ReadonlySet<string>>([
    ["changed", new Set(base.changed)],
    ["given", new Set(base.given)],
  ]);
  const depths = new Set(
    selected.flatMap((spec) =>
      typeof spec.fileSet === "string" ? [] : [spec.fileSet.changedPlus],
    ),
  );
  for (const n of [...depths].toSorted((a, b) => a - b)) {
    const plus = await changedPlusSet(base.root, trees, base.changed, n);
    const { only } = base;
    const files = only === undefined ? plus.files : plus.files.filter((f) => only.includes(f));
    const name = setName({ changedPlus: n });
    sets.set(name, new Set(files));
    sizes.push({ set: name, files: files.length, noExtractor: plus.noExtractor });
  }
  return sets;
}

/** What every checker of a run shares: the store, each binary's version,
 * and where each checker's use of the store is recorded. */
interface RunContext {
  timeoutMs: number;
  renames: Renames;
  changed: readonly string[];
  /** The paths `.gitattributes` marks generated: a quality checker leaves them out of its set. */
  generated: ReadonlySet<string>;
  all: boolean;
  store: ResultStore;
  versions: ReadonlyMap<string, string | null>;
  uses: Map<string, StoreUse>;
  /** Checkers run at once. */
  jobs: number;
  /** Every rule pack a selected checker names, fetched once this run. */
  packs: ReadonlyMap<string, ResolvedPack>;
  /** What the run says once about how it ran, added to as checkers run. */
  warnings: string[];
  /** How long each checker that scored a side took; a store hit is not a run. */
  timed: Timing[];
}

/** Stands for the report directory in a stored key: it is new every run. */
const REPORT_DIR_IN_KEY = "<report>";

/**
 * One checker's rule packs as this run fetched them: the local file of each, the hash of each in
 * pack order, and the first pack that could not be fetched, which makes the checker unstored.
 */
interface CheckerPacks {
  rules: LocalRules;
  hashes: string[];
  unfetched?: string;
}

function packsOf(spec: CheckSpec, packs: ReadonlyMap<string, ResolvedPack>): CheckerPacks {
  const rules = new Map<string, string>();
  const hashes: string[] = [];
  let unfetched: string | undefined;
  for (const pack of spec.packs ?? []) {
    const resolved = packs.get(pack) ?? { reason: `${pack} was not fetched` };
    if ("reason" in resolved) {
      unfetched ??= resolved.reason;
    } else {
      rules.set(pack, resolved.path);
      hashes.push(`${pack}\0${resolved.hash}`);
    }
  }
  return { rules, hashes, ...(unfetched === undefined ? {} : { unfetched }) };
}

/** Why `spec` is never stored this run, or undefined when it is. */
function whyNotStored(
  spec: CheckSpec,
  version: string | null,
  packs: CheckerPacks,
): string | undefined {
  if (spec.notStored !== undefined) {
    return spec.notStored;
  }
  if (packs.unfetched !== undefined) {
    return `${packs.unfetched}, so the checker reads it over the network`;
  }
  return version === null ? `${spec.binary} --version gave no version` : undefined;
}

/**
 * A checker's key on one side, besides content: its version, its argv with the scored files taken
 * out, the content of each rule pack it runs, and the config files it reads in the side's whole
 * tree.
 */
function keyingFor(
  spec: CheckSpec,
  sides: { tree: Side; narrowed: Side },
  version: string,
  packHashes: readonly string[],
): Keying {
  const { tree, narrowed } = sides;
  const scored = new Set(narrowed.files);
  const argv = spec
    .args(narrowed.files, narrowed.root, REPORT_DIR_IN_KEY)
    .filter((arg) => !scored.has(arg))
    .map((arg) => arg.split(narrowed.root).join("<root>"));
  const read = [...argv, ...packHashes];
  const config = configHash(
    tree.root,
    tree.files,
    spec.configFiles ?? [],
    read,
    spec.resolvesInstalled === true,
  );
  return { checker: spec.name, version, config };
}

interface Sides<T extends Side> {
  before: T | null;
  after: T;
}

/**
 * Both narrowed sides with where their results are kept, and `spec`'s use of the store recorded in
 * `context.uses`.
 */
function keptSides(
  spec: CheckSpec,
  trees: Sides<Side>,
  narrowed: Sides<Side>,
  context: RunContext,
): Sides<KeptSide> {
  const version = context.versions.get(spec.binary) ?? null;
  const packs = packsOf(spec, context.packs);
  const notStored = whyNotStored(spec, version, packs);
  const keep = (tree: Side, side: Side, sideUse: SideUse): KeptSide => {
    const keying =
      notStored !== undefined || version === null
        ? null
        : keyingFor(spec, { tree, narrowed: side }, version, packs.hashes);
    return { ...side, rules: packs.rules, kept: { store: context.store, keying, use: sideUse } };
  };
  const use: StoreUse = {
    checker: spec.name,
    reference: null,
    shipped: { hits: 0, scored: 0 },
    ...(notStored === undefined ? {} : { notStored }),
  };
  context.uses.set(spec.name, use);
  let before: KeptSide | null = null;
  if (trees.before !== null && narrowed.before !== null) {
    use.reference = { hits: 0, scored: 0 };
    before = keep(trees.before, narrowed.before, use.reference);
  }
  return { before, after: keep(trees.after, narrowed.after, use.shipped) };
}

/** Whether the checker ran on either side, rather than answering both from the store. */
function scoredASide(use: StoreUse | undefined): boolean {
  return (use?.shipped.scored ?? 0) + (use?.reference?.scored ?? 0) > 0;
}

/** A verdict, and the cause when it is not measured because a run failed. */
interface Judged {
  verdict: Verdict;
  failedRun?: string;
}

/** One selected checker over its declared set on both sides; a set holding
 * no file the checker covers on either side is a reported skip, not a run. */
async function verdictFor(
  spec: CheckSpec,
  sides: Sides<Side>,
  set: ReadonlySet<string>,
  context: RunContext,
): Promise<Judged> {
  const narrowed = {
    before: sides.before === null ? null : narrow(sides.before, spec, set),
    after: narrow(sides.after, spec, set),
  };
  if (narrowed.after.files.length === 0 && (narrowed.before?.files.length ?? 0) === 0) {
    const name = setName(spec.fileSet);
    const summary = `${spec.name}: its ${name} set holds no file it covers — not run`;
    return { verdict: { check: spec.name, pass: true, skipped: true, summary } };
  }
  const { before, after } = keptSides(spec, sides, narrowed, context);
  const { renames } = context;
  const { timeoutMs } = context;
  const started = performance.now();
  const result = await evalChecker({ spec, before, after, timeoutMs, renames });
  if (scoredASide(context.uses.get(spec.name))) {
    context.timed.push({ checker: spec.name, ms: performance.now() - started });
  }
  const verdict: Verdict = {
    check: spec.name,
    pass: result.pass,
    summary: result.summary,
    ...(result.notMeasured === true ? { notMeasured: true as const } : {}),
  };
  const lines = verdictLines(result, context.changed, context.all);
  if (lines !== undefined) {
    verdict.lines = lines;
  }
  return { verdict, ...(result.failedRun === undefined ? {} : { failedRun: result.failedRun }) };
}

/** One checker's verdict over the set it declares. */
async function verdictOnEngine(
  spec: CheckSpec,
  sides: Sides<Side>,
  bySet: ReadonlyMap<string, ReadonlySet<string>>,
  context: RunContext,
): Promise<Verdict> {
  const setOf = (one: CheckSpec): ReadonlySet<string> => {
    const set = bySet.get(setName(one.fileSet)) ?? new Set<string>();
    return one.guardsSafety === true
      ? set
      : new Set([...set].filter((f) => !context.generated.has(f)));
  };
  return (await verdictFor(spec, sides, setOf(spec), context)).verdict;
}

/**
 * Compares the tree at `beforeRef` against `after` (a commit, or the working tree) through every
 * checker the change selects, each over the file set it declares.
 */
/** The point a run is at, its target and the limits it applies: the point's, unless a test sets one. */
function runLimits(options: CompareOptions): {
  at: Point;
  targetMs: number;
  timeoutMs: number;
  probeTimeoutMs: number;
} {
  const at = options.at ?? "pre-commit";
  const { targetMs, timeoutMs } = POINTS[at];
  return {
    at,
    targetMs: options.targetMs ?? targetMs,
    timeoutMs: options.timeoutMs ?? timeoutMs,
    probeTimeoutMs: options.probeTimeoutMs ?? timeoutMs,
  };
}

export async function compareTrees(
  root: string,
  beforeRef: string | null,
  after: string,
  options: CompareOptions = {},
): Promise<{
  changed: string[];
  sets: SetSize[];
  verdicts: Verdict[];
  store: StoreReport;
  warnings: string[];
}> {
  const changed = resolveChanged(root, beforeRef, after, options);
  const given = resolveGiven(root, beforeRef, after, options);
  const sets: SetSize[] = [
    { set: "changed", files: changed.length },
    { set: "given", files: given.length },
  ];

  const { selected: applicable, skipVerdicts } = selectApplicable(
    root,
    options.registry ?? REGISTRY,
    changed,
    options,
  );
  const unused: StoreReport = { checkers: [] };
  if (applicable.length === 0) {
    return { changed, sets, verdicts: skipVerdicts, store: unused, warnings: [] };
  }

  const { at, targetMs, timeoutMs, probeTimeoutMs } = runLimits(options);
  const probes = await probeAll(applicable, root, probeTimeoutMs);
  const missingVerdicts = missingPrerequisiteVerdicts(applicable, root, probes);
  // A binary that is missing or slow to answer takes its own checkers out of the run, never the
  // run: the others still measure, and its verdict stands beside theirs. A language without its
  // config has nothing to measure with.
  const runnable = applicable.filter((spec) => probes.get(spec.binary)?.present === true);
  if (missingVerdicts.some((verdict) => verdict.missingConfig === true) || runnable.length === 0) {
    const verdicts = [...skipVerdicts, ...missingVerdicts];
    return { changed, sets, verdicts, store: unused, warnings: [] };
  }
  const selected = engage(runnable, options);
  const warnings: string[] = [];

  const base = {
    root,
    changed,
    given,
    ...(options.only === undefined ? {} : { only: options.only }),
  };
  const fetchPack = options.fetchPack ?? fetchFromRegistry;
  const { context, verdicts } = await withPacks(selected, fetchPack, async (packs) => {
    const run: RunContext = {
      timeoutMs,
      renames:
        beforeRef === null ? new Map<string, string>() : renamedBetween(root, beforeRef, after),
      changed,
      generated: generatedPaths(root, [...changed, ...given]),
      all: options.allFindings === true,
      store: new ResultStore(root, storePointOf(at)),
      versions: new Map([...probes].map(([binary, probe]) => [binary, probe.version])),
      uses: new Map(),
      jobs: options.jobs ?? JOBS,
      packs,
      warnings,
      timed: [],
    };
    const found = await withBeforeAndAfter(root, beforeRef, after, async (before, afterSide) => {
      const trees = before === null ? [afterSide] : [before, afterSide];
      const bySet = await setsFor(base, selected, trees, sets);
      return runSelected(selected, { before, after: afterSide }, bySet, run);
    });
    return { context: run, verdicts: found };
  });
  const store = prunedStore(selected, context);
  recordTimings(root, at, context.timed);
  warnings.push(...slowLines(at, context.timed, targetMs));
  return {
    changed,
    sets,
    verdicts: [...skipVerdicts, ...missingVerdicts, ...verdicts],
    store,
    warnings,
  };
}

/** The run's store pruned to what it used, and each checker's use of it. */
function prunedStore(selected: readonly CheckSpec[], context: RunContext): StoreReport {
  context.store.prune();
  return {
    checkers: selected.flatMap((spec) => context.uses.get(spec.name) ?? []),
    ...(context.store.unwritten === undefined ? {} : { unwritten: context.store.unwritten }),
  };
}

/**
 * Every selected checker over the set it declares, `jobs` at a time; after the first failing
 * verdict no further checker starts, unless that verdict is not measured.
 */
async function runSelected(
  selected: readonly CheckSpec[],
  sides: Sides<Side>,
  bySet: ReadonlyMap<string, ReadonlySet<string>>,
  context: RunContext,
): Promise<Verdict[]> {
  let failed = false;
  const results = await mapLimit(selected, context.jobs, async (spec): Promise<Verdict | null> => {
    if (failed) {
      return null;
    }
    const verdict = await verdictOnEngine(spec, sides, bySet, context);
    // A checker not measured decides nothing, so the rest still run.
    if (!verdict.pass && verdict.notMeasured !== true) {
      failed = true;
    }
    return verdict;
  });
  return results.filter((v): v is Verdict => v !== null);
}

/** Hands `fn` every rule pack a selected checker names, each fetched once
 * into a scratch directory that is removed once `fn` settles. */
function withPacks<T>(
  selected: readonly CheckSpec[],
  fetchPack: FetchPack,
  fn: (packs: ReadonlyMap<string, ResolvedPack>) => Promise<T>,
): Promise<T> {
  const wanted = selected.flatMap((spec) => spec.packs ?? []);
  if (wanted.length === 0) {
    return fn(new Map());
  }
  return withScratchDir(PACKS_SCRATCH_PREFIX, async (dir) =>
    fn(await resolvePacks(wanted, dir, fetchPack)),
  );
}

function withBeforeAndAfter<T>(
  root: string,
  beforeRef: string | null,
  after: string,
  fn: (before: Side | null, after: Side) => Promise<T>,
): Promise<T> {
  if (beforeRef === null) {
    return withSide(root, after, (afterSide) => fn(null, afterSide));
  }
  return withSide(root, beforeRef, (beforeSide) =>
    withSide(root, after, (afterSide) => fn(beforeSide, afterSide)),
  );
}

export interface DoctorRow {
  check: string;
  binary: string;
  present: boolean;
  /** The probe ran out of time: the binary may be installed and only slow. */
  timedOut: boolean;
  install: string;
}

/** Binary presence per check, every distinct binary probed once. */
export async function doctorRows(
  specs: readonly CheckSpec[] = REGISTRY,
  probeTimeoutMs: number = PROBE_MS,
): Promise<DoctorRow[]> {
  const binaries = [...new Set(specs.map((spec) => spec.binary))];
  const probes = new Map(
    await Promise.all(
      binaries.map(async (binary): Promise<[string, Probe]> => [
        binary,
        await probeBinary(binary, probeTimeoutMs),
      ]),
    ),
  );
  return specs.map(({ name, binary, install }) => ({
    check: name,
    binary,
    present: probes.get(binary)?.present ?? false,
    timedOut: probes.get(binary)?.timedOut ?? false,
    install: installLine(install),
  }));
}

export interface StructuralCheckerStatus {
  present: boolean;
  patched: boolean;
}

/**
 * Whether the structural checker (sentrux) on PATH reports a qsm-patched version, distinguishing
 * that from an unpatched upstream `sentrux` and from none present at all.
 */
export async function structuralCheckerStatus(): Promise<StructuralCheckerStatus> {
  const result = await spawnAsync(tmpdir(), "sentrux", ["--version"], PROBE_MS);
  if (spawnFailure(result, "sentrux") !== null) {
    return { present: false, patched: false };
  }
  const version = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { present: true, patched: /-qsm(\.|\b)/.test(version) };
}
