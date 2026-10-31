// Materializes a tree as an on-disk directory for a checker to score: a
// commit checked out through a scratch index, or the working tree via a
// scratch git index (the live index copied, its tracked files refreshed with
// `git add -u`, `git write-tree`, then that tree checked out) so an ignored
// or untracked path — node_modules, dist, a file nobody added — never enters
// a score just because it sits on disk; the ignored inputs the repository's
// own commands read are linked back in (linkInputs). Both sides of every comparison go through one of these,
// so the only difference a checker ever sees is the change itself. The
// materialized directory is then given its own throwaway git index (`git
// init` + `git add -A`, no commit) — a checker that discovers its targets
// via `git ls-files` (the structural checker does) otherwise finds no `.git`
// there and silently falls back to a plain filesystem walk with no import
// resolution at all, scoring nothing real under an inflated quality number.

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { arrayOf, recordOf, str } from "./json.ts";

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
  const stderr = result.stderr === null ? "" : String(result.stderr).trim();
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

/** A git command's NUL-separated output; `input` goes to its stdin. `check-ignore` exits 1 when
 * it matched nothing, which is an answer, not a failure. */
function gitLines(root: string, args: readonly string[], input?: string): string[] {
  const result = spawnSync("git", ["-C", root, ...args], {
    env: gitEnv(),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    ...(input === undefined ? {} : { input }),
  });
  const matchedNothing = args[0] === "check-ignore" && result.status === 1;
  if (result.status !== 0 && !matchedNothing) {
    fail(`git ${args[0] ?? ""}`, result);
  }
  return result.stdout.split("\0").filter((path) => path.length > 0);
}

/** Whether git ignores `path`: a tracked file never is, wherever it sits. */
export function isIgnored(root: string, path: string): boolean {
  return gitLines(root, ["check-ignore", "-z", "--stdin"], path).length > 0;
}

// obj/ holds dotnet's restore (project.assets.json), which `dotnet format --no-restore` reads.
const DEPENDENCY_DIRS = new Set(["node_modules", ".venv", "obj"]);
const TSCONFIG = /^tsconfig(?:\.[^/]*)?\.json$/;
const GLOB = /[*?[{]/;

/** The paths a tsconfig's `include` and `files` name, cut at the first glob segment, relative to
 * the tree's root; one that leaves the tree is not the tree's input. */
export function tsconfigInputs(dir: string, config: string): string[] {
  const parsed = recordOf(Bun.JSONC.parse(readFileSync(join(dir, config), "utf8")));
  const entries = [...(arrayOf(parsed?.include) ?? []), ...(arrayOf(parsed?.files) ?? [])];
  const inputs: string[] = [];
  for (const entry of entries) {
    const segments = str(entry).split("/");
    const glob = segments.findIndex((segment) => GLOB.test(segment));
    const literal = (glob === -1 ? segments : segments.slice(0, glob)).join("/");
    const path = relative(dir, resolve(dir, dirname(config), literal));
    if (literal.length > 0 && path.length > 0 && !path.startsWith("..") && !isAbsolute(path)) {
      inputs.push(path);
    }
  }
  return inputs;
}

/**
 * A materialized tree is scored with the inputs the repository's own commands read, though git
 * holds none of them: every dependency directory the live checkout installed, at any depth (a
 * plugin's own node_modules), and every ignored path a tsconfig names (generated declarations).
 * Each is symlinked in from the live worktree, never reinstalled or regenerated per comparison.
 * Only an ignored path qualifies, so a file the reference commit lacks never enters it this way.
 */
function linkInputs(dir: string, root: string, treeish: string): void {
  const ignoredDirs = gitLines(root, [
    "ls-files",
    "-z",
    "--others",
    "--ignored",
    "--exclude-standard",
    "--directory",
  ]).map((path) => path.replace(/\/$/, ""));
  const deps = ignoredDirs.filter((path) => DEPENDENCY_DIRS.has(basename(path)));
  const configs = gitLines(root, ["ls-tree", "-r", "-z", "--name-only", treeish]).filter((path) =>
    TSCONFIG.test(basename(path)),
  );
  const named = configs.flatMap((config) => tsconfigInputs(dir, config));
  const ignored = new Set(
    named.length === 0
      ? []
      : gitLines(root, ["check-ignore", "-z", "--stdin", "--no-index"], named.join("\0")),
  );
  const inputs = [...deps.filter((path) => existsSync(join(dir, dirname(path)))), ...ignored];
  for (const path of new Set(inputs)) {
    if (existsSync(join(root, path)) && !existsSync(join(dir, path))) {
      mkdirSync(join(dir, dirname(path)), { recursive: true });
      symlinkSync(join(root, path), join(dir, path));
    }
  }
}

/** Writes `treeish` into `dir` through a scratch index and `checkout-index`, not `git archive`:
 * archive drops an `export-ignore` path, and a generated file the code imports must be on disk for
 * a type-aware checker to resolve it. Leaving generated files unscored is the file sets' job. */
function checkoutInto(root: string, treeish: string, dir: string): void {
  const env = gitEnv({ GIT_INDEX_FILE: `${dir}.checkout-index` });
  try {
    const read = spawnSync("git", ["-C", root, "read-tree", treeish], { env });
    if (read.status !== 0) {
      fail(`git read-tree ${treeish}`, read);
    }
    const checkout = spawnSync("git", ["-C", root, "checkout-index", "-a", `--prefix=${dir}/`], {
      env,
    });
    if (checkout.status !== 0) {
      fail("git checkout-index", checkout);
    }
  } finally {
    rmSync(`${dir}.checkout-index`, { force: true });
  }
}

/** A checker that shells out to `git ls-files` to find what to scan — the
 * structural checker does — silently degrades to a plain filesystem walk
 * with no import resolution once it finds no `.git`, and reports a
 * meaningless, artificially high quality score instead of failing loud. A
 * `git init` plus `git add -A` gives the materialized tree a git index — no
 * commit needed, `git ls-files` reads the index — so it scans and resolves
 * imports exactly as it would in the live checkout. `.gitignore` travelled
 * in with the checkout, so `node_modules`/`dist` stay excluded the same way. */
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
    checkoutInto(root, ref, dir);
    linkInputs(dir, root, ref);
    gitIndexInto(dir);
    return fn(dir);
  });
}

/** The checkout's own index file, which a linked worktree keeps under its own git directory. */
function liveIndex(root: string): string {
  const r = spawnSync("git", ["-C", root, "rev-parse", "--git-path", "index"], {
    env: gitEnv(),
    encoding: "utf8",
  });
  if (r.status !== 0) {
    fail("git rev-parse --git-path index", r);
  }
  const path = r.stdout.trim();
  return isAbsolute(path) ? path : join(root, path);
}

/** A scratch directory holding what is staged: a copy of the live index, its
 * tree checked out. This is "the shipped side" for every comparison, because
 * only what is staged or committed is on its way out: an unstaged change, an
 * untracked file and an ignored path never enter it. The live directory itself
 * is never handed to a checker, so node_modules/ or dist/ never enter a score
 * just because they sit on disk. Removed once `fn` settles. */
export function withIndexTree<T>(root: string, fn: (dir: string) => Promise<T> | T): Promise<T> {
  return withScratchDir(SCRATCH_PREFIX, (dir) => {
    const indexFile = `${dir}.index`;
    try {
      const live = liveIndex(root);
      if (existsSync(live)) {
        copyFileSync(live, indexFile);
      }
      const env = gitEnv({ GIT_INDEX_FILE: indexFile });
      const writeTree = spawnSync("git", ["-C", root, "write-tree"], { env, encoding: "utf8" });
      if (writeTree.status !== 0) {
        fail("git write-tree (scratch index)", writeTree);
      }
      const tree = writeTree.stdout.trim();
      checkoutInto(root, tree, dir);
      linkInputs(dir, root, tree);
      gitIndexInto(dir);
      return fn(dir);
    } finally {
      rmSync(indexFile, { force: true });
    }
  });
}
