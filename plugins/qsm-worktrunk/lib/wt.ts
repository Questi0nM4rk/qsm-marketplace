// The one place that knows how this plugin calls `wt`: the argument vectors, and the things it asks
// for.

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs a command by its argument vector and resolves once it exits. */
export type Runner = (argv: readonly string[], cwd?: string) => Promise<CommandResult>;

/** What the session is doing, as a shell prompt or a status line reads it. */
export type MarkerState = "working" | "waiting" | "cleared";

const MARKER_GLYPH: Record<"waiting" | "working", string> = {
  working: "\u{1F916}",
  waiting: "\u{1F4AC}",
};

export function markerArgv(state: MarkerState): string[] {
  return state === "cleared"
    ? ["wt", "config", "state", "marker", "clear"]
    : ["wt", "config", "state", "marker", "set", MARKER_GLYPH[state]];
}

/**
 * Create the workspace for a new branch off `base` (the caller's current branch), or move to the
 * one that exists.
 */
export function createWorkspaceArgv(branch: string, base: string | null): string[] {
  return ["wt", "switch", "--create", branch, ...(base === null ? [] : ["--base", base])];
}

/**
 * Remove a workspace, with no confirmation and no background step left running after the call
 * returns.
 */
export function removeWorkspaceArgv(branch: string): string[] {
  return ["wt", "remove", "--foreground", branch];
}

function versionArgv(): string[] {
  return ["wt", "--version"];
}

/** The flags `createWorkspaceArgv` passes. */
export const REQUIRED_SWITCH_FLAGS = ["--create", "--base"] as const;

/**
 * The oldest wt whose `switch` is known to take the flags above and to put the worktree where `git
 * worktree list` reports it.
 */
export const MINIMUM_WT_VERSION = "0.22.0";

function switchHelpArgv(): string[] {
  return ["wt", "switch", "--help"];
}

/** Asks the shell which `wt` PATH resolves to. */
function resolveArgv(): string[] {
  return ["sh", "-c", "command -v wt"];
}

function worktreeListArgv(): string[] {
  return ["git", "worktree", "list", "--porcelain"];
}

function currentBranchArgv(): string[] {
  return ["git", "symbolic-ref", "--short", "HEAD"];
}

export interface Worktree {
  readonly path: string;
  /** the branch checked out, or null when detached */
  readonly branch: string | null;
}

const WORKTREE_LINE = "worktree ";
const BRANCH_LINE = "branch refs/heads/";

/**
 * `git worktree list --porcelain`: stanzas separated by a blank line, each `worktree <path>`
 * first, then `HEAD <sha>`, then `branch refs/heads/<name>` or `detached`.
 */
export function parseWorktreeList(porcelain: string): Worktree[] {
  const out: Worktree[] = [];
  let current: { path: string; branch: string | null } | null = null;
  for (const raw of porcelain.split("\n")) {
    const line = raw.trim();
    if (line.startsWith(WORKTREE_LINE)) {
      current = { path: line.slice(WORKTREE_LINE.length), branch: null };
      out.push(current);
    } else if (line.startsWith(BRANCH_LINE) && current !== null) {
      current.branch = line.slice(BRANCH_LINE.length);
    }
  }
  return out;
}

export function worktreePathOf(list: readonly Worktree[], branch: string): string | null {
  return list.find((w) => w.branch === branch)?.path ?? null;
}

export function worktreeBranchOf(list: readonly Worktree[], path: string): string | null {
  const wanted = path.replace(/\/+$/, "");
  return list.find((w) => w.path.replace(/\/+$/, "") === wanted)?.branch ?? null;
}

function lastLineOf(result: CommandResult | null): string {
  if (result === null) {
    return "";
  }
  const lines = `${result.stderr}\n${result.stdout}`.split("\n").map((l) => l.trim());
  return lines.findLast((l) => l.length > 0) ?? "";
}

function describeFailure(
  argv: readonly string[],
  result: CommandResult | null,
  why?: string,
): string {
  const command = argv.join(" ");
  if (why !== undefined) {
    return `${command}: ${why}`;
  }
  if (result === null) {
    return `${command}: could not start`;
  }
  const last = lastLineOf(result);
  return last.length === 0
    ? `${command}: exit ${result.exitCode}`
    : `${command}: exit ${result.exitCode}: ${last}`;
}

/** A wt or git call that did not do what was asked, with the command and the
 * last line it printed, so the harness's error names the cause. */
export class WtError extends Error {
  constructor(
    argv: readonly string[],
    result: CommandResult | null,
    why?: string,
    cause?: unknown,
  ) {
    super(describeFailure(argv, result, why), { cause });
    this.name = "WtError";
  }
}

async function mustRun(run: Runner, argv: readonly string[], cwd?: string): Promise<CommandResult> {
  let result: CommandResult | null = null;
  let failure: unknown;
  try {
    result = await run(argv, cwd);
  } catch (error) {
    failure = error;
  }
  if (result === null) {
    throw new WtError(argv, null, undefined, failure);
  }
  if (result.exitCode !== 0) {
    throw new WtError(argv, result);
  }
  return result;
}

export async function setMarker(run: Runner, state: MarkerState, cwd?: string): Promise<boolean> {
  const result = await run(markerArgv(state), cwd);
  return result.exitCode === 0;
}

async function currentBranch(run: Runner, cwd?: string): Promise<string | null> {
  const result = await tryRun(run, currentBranchArgv(), cwd);
  const name = result?.stdout.trim() ?? "";
  return result?.exitCode === 0 && name.length > 0 ? name : null;
}

async function listWorktrees(run: Runner, cwd?: string): Promise<Worktree[]> {
  return parseWorktreeList((await mustRun(run, worktreeListArgv(), cwd)).stdout);
}

/**
 * Creates the workspace for `branch` through wt, off the caller's current branch, and returns the
 * path git lists for it.
 */
export async function createWorkspace(run: Runner, branch: string, cwd?: string): Promise<string> {
  const base = await currentBranch(run, cwd);
  const argv = createWorkspaceArgv(branch, base);
  await mustRun(run, argv, cwd);
  const path = worktreePathOf(await listWorktrees(run, cwd), branch);
  if (path === null) {
    throw new WtError(argv, null, `wt exited 0 but git lists no worktree on branch ${branch}`);
  }
  return path;
}

/** Removes the workspace at `path` through wt, and its branch when nothing on it is unmerged. */
export async function removeWorkspace(run: Runner, path: string, cwd?: string): Promise<void> {
  const branch = worktreeBranchOf(await listWorktrees(run, cwd), path);
  if (branch === null) {
    throw new WtError(worktreeListArgv(), null, `no worktree with a branch at ${path}`);
  }
  await mustRun(run, removeWorkspaceArgv(branch), cwd);
}

/** Runs a command and answers null instead of throwing, because every caller
 * here treats "could not ask" the same as "answered no". */
async function tryRun(
  run: Runner,
  argv: readonly string[],
  cwd?: string,
): Promise<CommandResult | null> {
  try {
    return await run(argv, cwd);
  } catch {
    return null;
  }
}

/** The version string `wt` prints, or null when it is not on PATH or refuses
 * to report one. Standard error counts: some builds print the version there. */
export async function wtVersion(run: Runner, cwd?: string): Promise<string | null> {
  const result = await tryRun(run, versionArgv(), cwd);
  if (result === null || result.exitCode !== 0) {
    return null;
  }
  const printed = result.stdout.trim().length > 0 ? result.stdout : result.stderr;
  const line = printed.split("\n")[0]?.trim() ?? "";
  return line.length > 0 ? line : null;
}

/** "wt 0.22.0" -> [0, 22, 0]; null when no dotted number is in the line. */
export function parseVersion(line: string): number[] | null {
  const [, major, minor, patch] = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(line) ?? [];
  return major === undefined ? null : [Number(major), Number(minor), Number(patch ?? "0")];
}

export function meetsMinimum(line: string, minimum: string = MINIMUM_WT_VERSION): boolean {
  const have = parseVersion(line);
  const want = parseVersion(minimum);
  if (have === null || want === null) {
    return false;
  }
  for (let i = 0; i < 3; i += 1) {
    const [h, w] = [have[i] ?? 0, want[i] ?? 0];
    if (h !== w) {
      return h > w;
    }
  }
  return true;
}

/** True when this `wt`'s own help for `switch` lists every flag the create path passes. */
export async function supportsWorkspaceCreate(run: Runner, cwd?: string): Promise<boolean> {
  const result = await tryRun(run, switchHelpArgv(), cwd);
  if (result === null || result.exitCode !== 0) {
    return false;
  }
  const help = `${result.stdout}\n${result.stderr}`;
  return REQUIRED_SWITCH_FLAGS.every((flag) => help.includes(flag));
}

/** Where `wt` resolves on PATH, or null when the question could not be asked.
 * Used only to name the binary in a report, never to call it. */
export async function wtPath(run: Runner, cwd?: string): Promise<string | null> {
  const result = await tryRun(run, resolveArgv(), cwd);
  if (result === null || result.exitCode !== 0) {
    return null;
  }
  const line = result.stdout.split("\n")[0]?.trim() ?? "";
  return line.length > 0 ? line : null;
}
