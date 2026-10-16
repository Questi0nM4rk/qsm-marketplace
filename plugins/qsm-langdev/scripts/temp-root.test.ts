// The plugin's tests leave nothing behind in the temp root. Every other test
// file of this plugin runs in a child `bun test` with a fresh TMPDIR, so no
// other process adds to what is counted, and every entry still there when it
// exits is named in the failure: a test's sandbox or a temp dir its own
// process left.

import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { Glob } from "bun";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

const REPO = resolve(import.meta.dir, "../../..");
const PLUGIN = resolve(import.meta.dir, "..");
const SELF = relative(PLUGIN, import.meta.path);

test("the plugin's tests leave no entry in their temp root", () => {
  const root = sandboxDir("qsm-langdev-temp-root-");
  const files = [...new Glob("**/*.test.ts").scanSync(PLUGIN)]
    .filter((file) => file !== SELF && !file.startsWith("hooks/"))
    .map((file) => `./${relative(REPO, join(PLUGIN, file))}`);
  const run = spawnSync("bun", ["test", ...files], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, TMPDIR: root },
  });

  expect(readdirSync(root)).toEqual([]);
  // an empty root proves nothing unless the tests ran
  expect(run.stderr).toMatch(/Ran \d+ tests across \d+ files/);
}, 180_000);
