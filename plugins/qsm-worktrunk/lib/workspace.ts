// Which workspace is this, told by git itself rather than by a path the session remembers.

import type { Runner } from "./wt.ts";

export interface Workspace {
  readonly name: string;
  readonly path: string;
  readonly branch: string;
}

/** Runs one git command and resolves its trimmed output, or null when git
 * refused: a caller reads "no answer" instead of an exit code. */
export type GitReader = (args: readonly string[]) => Promise<string | null>;

export function gitReader(run: Runner, cwd: string): GitReader {
  return async (args) => {
    let result: Awaited<ReturnType<Runner>>;
    try {
      result = await run(["git", ...args], cwd);
    } catch {
      return null;
    }
    return result.exitCode === 0 ? result.stdout.trim() : null;
  };
}

const DIRS_ARGS = ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"] as const;

/** The workspace the reader's directory sits in, or null for the main
 * checkout and for anywhere outside a repository. */
export async function readWorkspace(git: GitReader): Promise<Workspace | null> {
  if ((await git(["rev-parse", "--is-inside-work-tree"])) !== "true") {
    return null;
  }
  const dirs = await git(DIRS_ARGS);
  const [gitDir, commonDir] = (dirs ?? "").split("\n").map((line) => line.trim());
  if (gitDir === undefined || commonDir === undefined || gitDir.length === 0) {
    return null;
  }
  if (gitDir === commonDir) {
    return null;
  }
  const path = await git(["rev-parse", "--show-toplevel"]);
  if (path === null) {
    return null;
  }
  return { name: lastSegment(gitDir), path, branch: await readBranch(git) };
}

/** The main checkout's root, read from the common git directory, or null
 * outside a repository. Every workspace of a repository answers the same. */
export async function readMainCheckout(git: GitReader): Promise<string | null> {
  const dirs = await git(DIRS_ARGS);
  const commonDir = (dirs ?? "").split("\n")[1]?.trim() ?? "";
  if (commonDir.length === 0) {
    return null;
  }
  return parentOf(commonDir);
}

async function readBranch(git: GitReader): Promise<string> {
  const branch = await git(["symbolic-ref", "--short", "HEAD"]);
  if (branch !== null && branch.length > 0) {
    return branch;
  }
  const head = await git(["rev-parse", "--short", "HEAD"]);
  return `detached at ${head ?? "an unknown commit"}`;
}

/** What the turn carries in the main checkout: it only follows main, so a change starts by leaving it. */
export const MAIN_CHECKOUT_CONTEXT = [
  "---",
  "workspace: the main checkout, which only follows main; no session works in it",
  "Before any change, move into this session's own worktree with EnterWorktree.",
  "---",
].join("\n");

/** What the turn carries: the three facts the agent would otherwise ask for. */
export function workspaceContext(workspace: Workspace, home?: string): string {
  return [
    "---",
    `workspace: ${workspace.name}`,
    `path: ${shorten(workspace.path, home)}`,
    `branch: ${workspace.branch}`,
    "---",
  ].join("\n");
}

function shorten(path: string, home?: string): string {
  if (home === undefined || home.length === 0 || !path.startsWith(home)) {
    return path;
  }
  return `~${path.slice(home.length)}`;
}

function lastSegment(path: string): string {
  return path.replace(/\/+$/, "").split("/").pop() ?? path;
}

function parentOf(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const cut = trimmed.lastIndexOf("/");
  return cut > 0 ? trimmed.slice(0, cut) : "/";
}
