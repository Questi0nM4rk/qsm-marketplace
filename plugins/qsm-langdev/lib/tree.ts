// Materializes a tree as an on-disk directory for a checker to score: a
// commit via `git archive`, or the working tree via a scratch git index
// (`git add -A` into it, `git write-tree`, then `git archive` that tree) so
// an ignored path — node_modules, dist — never enters a score just because
// it sits on disk. Both sides of every comparison go through one of these,
// so the only difference a checker ever sees is the change itself. The
// materialized directory is then given its own throwaway git index (`git
// init` + `git add -A`, no commit) — a checker that discovers its targets
// via `git ls-files` (the structural checker does) otherwise finds no `.git`
// there and silently falls back to a plain filesystem walk with no import
// resolution at all, scoring nothing real under an inflated quality number.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRATCH_PREFIX = "qsm-langdev-tree-";
const ABANDONED_MS = 60 * 60 * 1000;

// A scratch directory survives its own process being killed: the finally
// below removes what THIS run finished with, but cannot run when the
// process is killed (a timed-out hook, Ctrl-C), so every run also sweeps
// what earlier runs abandoned.
function sweepAbandoned(prefix: string): void {
  const parent = tmpdir();
  let entries: string[];
  try {
    entries = readdirSync(parent);
  } catch {
    return;
  }
  const deadline = Date.now() - ABANDONED_MS;
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) {
      continue;
    }
    const path = join(parent, entry);
    try {
      if (statSync(path).mtimeMs > deadline) {
        continue;
      }
      rmSync(path, { recursive: true, force: true });
    } catch {
      // Gone already, or someone else's to remove.
    }
  }
}

function fail(step: string, result: ReturnType<typeof spawnSync>): never {
  const stderr = result.stderr ? String(result.stderr).trim() : "";
  const suffix = stderr.length > 0 ? `: ${stderr}` : "";
  throw new Error(`${step} failed${suffix}`);
}

// A git hook exports GIT_DIR (and sometimes GIT_INDEX_FILE) into this process's environment so git
// can find the repository without a cwd inside its work tree.
const GIT_REPO_ENV_KEYS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_PREFIX",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_NAMESPACE",
] as const;

function gitEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of GIT_REPO_ENV_KEYS) {
    delete env[key];
  }
  return extra ? { ...env, ...extra } : env;
}

/**
 * A materialized tree resolves the same packages a live checkout would: dependency directories
 * symlink in from the live worktree rather than being reinstalled per comparison.
 */
function linkDeps(dir: string, root: string): void {
  for (const deps of ["node_modules", ".venv"]) {
    const installed = join(root, deps);
    if (existsSync(installed) && !existsSync(join(dir, deps))) {
      symlinkSync(installed, join(dir, deps));
    }
  }
}

function archiveInto(root: string, treeish: string, dir: string): void {
  const archive = spawnSync("git", ["-C", root, "archive", "--format=tar", treeish], {
    env: gitEnv(),
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (archive.status !== 0) {
    fail(`git archive ${treeish}`, archive);
  }
  const extract = spawnSync("tar", ["-x", "-C", dir], { input: archive.stdout });
  if (extract.status !== 0) {
    fail("tar -x", extract);
  }
}

/** A checker that shells out to `git ls-files` to find what to scan — the
 * structural checker does — silently degrades to a plain filesystem walk
 * with no import resolution once it finds no `.git`, and reports a
 * meaningless, artificially high quality score instead of failing loud. A
 * `git init` plus `git add -A` gives the materialized tree a git index — no
 * commit needed, `git ls-files` reads the index — so it scans and resolves
 * imports exactly as it would in the live checkout. `.gitignore` travelled
 * in with the archive, so `node_modules`/`dist` stay excluded the same way. */
function gitIndexInto(dir: string): void {
  const env = gitEnv();
  const init = spawnSync("git", ["-C", dir, "init", "-q", "--initial-branch=main", "."], { env });
  if (init.status !== 0) {
    fail("git init (materialized tree)", init);
  }
  const add = spawnSync("git", ["-C", dir, "add", "-A"], { env });
  if (add.status !== 0) {
    fail("git add -A (materialized tree)", add);
  }
}

/** What a materialized tree holds after `leaveOut`: how many files it took
 * out, and the index listing (mode, blob id, path) of the rest, which is
 * equal on two trees exactly when what they kept is the same. */
export interface Kept {
  leftOut: number;
  listing: string;
}

/**
 * Removes every indexed path `matches` names from a materialized tree, on disk and from its index,
 * so a checker that lists the index or walks the directory sees neither.
 */
export function leaveOut(dir: string, matches: (path: string) => boolean): Kept {
  const env = gitEnv();
  const listFiles = (args: string[]): string => {
    const listed = spawnSync("git", ["-C", dir, "ls-files", ...args], {
      env,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
    if (listed.status !== 0) {
      fail("git ls-files (materialized tree)", listed);
    }
    return listed.stdout;
  };
  const out = listFiles(["-z"])
    .split("\0")
    .filter((path) => path.length > 0 && matches(path));
  for (const path of out) {
    rmSync(join(dir, path), { force: true });
  }
  if (out.length > 0) {
    gitIndexInto(dir);
  }
  return { leftOut: out.length, listing: listFiles(["-s"]) };
}

/**
 * Hands `fn` a fresh scratch directory under `prefix` and removes it afterward, whatever `fn` did.
 */
export async function withScratchDir<T>(
  prefix: string,
  fn: (dir: string) => Promise<T> | T,
): Promise<T> {
  sweepAbandoned(prefix);
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A scratch directory holding the tree at `ref` (a commit), dependency
 * directories linked in, removed once `fn` settles. */
export function withCommitTree<T>(
  root: string,
  ref: string,
  fn: (dir: string) => Promise<T> | T,
): Promise<T> {
  return withScratchDir(SCRATCH_PREFIX, (dir) => {
    archiveInto(root, ref, dir);
    linkDeps(dir, root);
    gitIndexInto(dir);
    return fn(dir);
  });
}

/** A scratch directory holding what the working tree would ship: a scratch
 * git index seeded with `git add -A` over the live worktree — tracked,
 * modified, and new non-ignored files; an ignored file never enters it —
 * then that index's tree archived out. This is "the shipped side" for
 * every comparison: the live directory itself is never handed to a
 * checker, so node_modules/ or dist/ never enter a score just because they
 * sit on disk. Removed once `fn` settles. */
export function withWorktreeTree<T>(root: string, fn: (dir: string) => Promise<T> | T): Promise<T> {
  return withScratchDir(SCRATCH_PREFIX, (dir) => {
    const indexFile = `${dir}.index`;
    try {
      const env = gitEnv({ GIT_INDEX_FILE: indexFile });
      const add = spawnSync("git", ["-C", root, "add", "-A"], { env });
      if (add.status !== 0) {
        fail("git add -A (scratch index)", add);
      }
      const writeTree = spawnSync("git", ["-C", root, "write-tree"], { env, encoding: "utf8" });
      if (writeTree.status !== 0) {
        fail("git write-tree (scratch index)", writeTree);
      }
      archiveInto(root, writeTree.stdout.trim(), dir);
      linkDeps(dir, root);
      gitIndexInto(dir);
      return fn(dir);
    } finally {
      rmSync(indexFile, { force: true });
    }
  });
}
