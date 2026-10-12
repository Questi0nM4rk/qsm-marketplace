// The plugin's tests leave nothing behind in the temp root. Every other test
// file of this plugin runs in a child `bun test` with a fresh TMPDIR, so no
// other process adds to what is counted, and every entry still there when it
// exits is named in the failure: a test's sandbox, or a temp dir the binary
// or a hook it spawned left.

import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { Glob } from "bun";

const REPO = resolve(import.meta.dir, "../../..");
const PLUGIN = resolve(import.meta.dir, "..");
const SELF = relative(PLUGIN, import.meta.path);

// semgrep's own directory, one fixed name reused by every run, so it never
// accumulates; qsm-langdev cannot give it a different home.
const UPSTREAM = new Set(["semgrep-mcp"]);

test("the plugin's tests leave no entry in their temp root", () => {
  const root = mkdtempSync(join(tmpdir(), "qsm-langdev-temp-root-"));
  try {
    const files = [...new Glob("**/*.test.ts").scanSync(PLUGIN)]
      .filter((file) => file !== SELF && !file.startsWith("hooks/"))
      .map((file) => `./${relative(REPO, join(PLUGIN, file))}`);
    const run = spawnSync("bun", ["test", ...files], {
      cwd: REPO,
      encoding: "utf8",
      env: { ...process.env, TMPDIR: root },
    });

    expect(readdirSync(root).filter((entry) => !UPSTREAM.has(entry))).toEqual([]);
    // an empty root proves nothing unless the tests ran
    expect(run.stderr).toMatch(/Ran \d+ tests across \d+ files/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 180_000);
