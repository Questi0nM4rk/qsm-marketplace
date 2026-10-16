// The test run's temp guard, loaded by bunfig.toml as the `bun test` preload, and the sandbox helper
// tests import. A preload's hooks are global: afterEach runs after every test of every file and
// afterAll once per run. A helper's own top-level afterEach would bind only to the first test file
// that imports it, which is how every other file's sandboxes leaked.
import { afterAll, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const RUN_PREFIX = "qsm-test-run.";
const repoRoot = resolve(import.meta.dir, "../..");
const sandboxes: string[] = [];

/** A fresh temp directory, removed after the test that made it. */
export function sandboxDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  sandboxes.push(dir);
  return dir;
}

/** Writes `text` to `rel` under `root`, making the directories on the way. */
export function writeIn(root: string, rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

/** Removes run dirs whose run died before its afterAll, naming each; a live run is left alone. */
function cleanBefore(base: string): void {
  for (const name of readdirSync(base)) {
    const pid = Number(name.slice(RUN_PREFIX.length).split(".")[0]);
    if (!name.startsWith(RUN_PREFIX) || !Number.isInteger(pid) || alive(pid)) {
      continue;
    }
    rmSync(join(base, name), { recursive: true, force: true });
    console.error(
      `test-run: removed ${join(base, name)}, left by run ${pid} that ended before its cleanup`,
    );
  }
}

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !["node_modules", "dist", ".git", ".claude"].includes(entry.name)) {
      yield* sources(path);
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      yield path;
    }
  }
}

/** The source files holding the longest string literal that starts `name`: who made it, when told. */
function makers(name: string): string {
  let best = "";
  let files: string[] = [];
  for (const dir of ["lib", "plugins", ".gates"]) {
    for (const path of sources(join(repoRoot, dir))) {
      for (const [, literal = ""] of readFileSync(path, "utf8").matchAll(
        /["'`]([^"'`$\\\n/]{3,})/g,
      )) {
        if (!name.startsWith(literal) || literal.length < best.length) {
          continue;
        }
        if (literal.length > best.length) {
          best = literal;
          files = [];
        }
        files.push(path.slice(repoRoot.length + 1));
      }
    }
  }
  return files.length === 0
    ? "maker unknown"
    : `made by "${best}" in ${[...new Set(files)].join(", ")}`;
}

// The run: every temp path below points into one directory of this process, so a nested `bun test`
// (another process) starts its own run inside it.
const run = mkdtempSync(join(tmpdir(), `${RUN_PREFIX}${process.pid}.`));
cleanBefore(dirname(run));
process.env.TMPDIR = run;

afterEach(() => {
  for (const dir of sandboxes.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

afterAll(() => {
  const left = readdirSync(run);
  const lines = left.map((name) => `  ${join(run, name)}: ${makers(name)}`);
  rmSync(run, { recursive: true, force: true });
  if (lines.length > 0) {
    throw new Error(
      `test-run: ${lines.length} temp entries left after the run; each test removes what it makes:\n${lines.join("\n")}`,
    );
  }
});
