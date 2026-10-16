// The test run's temp guard, loaded by bunfig.toml as the `bun test` preload, and the sandbox helper
// tests import. A preload's hooks are global: afterEach runs after every test of every file and
// afterAll once per run. A helper's own top-level afterEach would bind only to the first test file
// that imports it, which is how every other file's sandboxes leaked.
import { afterAll, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const RUN_PREFIX = "qsm-test-run.";
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
  } catch {
    return false;
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

// The run: every temp path below points into one directory of this process. A nested `bun test`
// inherits TMPDIR, so the runs' parent is passed down too and its run sits beside this one.
const runs = process.env.QSM_TEST_RUNS ?? join(tmpdir(), "qsm-test-runs");
process.env.QSM_TEST_RUNS = runs;
mkdirSync(runs, { recursive: true });
cleanBefore(runs);
const run = mkdtempSync(join(runs, `${RUN_PREFIX}${process.pid}.`));
process.env.TMPDIR = run;

afterEach(() => {
  for (const dir of sandboxes.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

afterAll(() => {
  const left = readdirSync(run);
  const lines = left.map((name) => `  ${join(run, name)}`);
  rmSync(run, { recursive: true, force: true });
  if (lines.length > 0) {
    throw new Error(
      `test-run: ${lines.length} temp entries left after the run; each test removes what it makes:\n${lines.join("\n")}`,
    );
  }
});
