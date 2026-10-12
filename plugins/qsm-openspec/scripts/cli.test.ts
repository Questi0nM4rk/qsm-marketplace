// These run the binary's own entry point, the same one the compiled binary wraps, so a refactor
// of the report or of the argument handling cannot quietly break the CLI.

import { afterEach, describe, expect, test } from "bun:test";
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "cli.ts");

// Every sandbox this file makes is removed after the test that made it,
// passing or failing: a `finally` inside one test would leave the rest.
const sandboxes: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "qsm-openspec-cli-"));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of sandboxes.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** `process.execPath` is the bun running this test: the verb is exercised
 * through the same entry point the compiled binary wraps, with no
 * assumption about what is on PATH. */
function run(cwd: string, ...args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

describe("verbs", () => {
  test("an unknown verb exits 2 and names the usage", () => {
    const answer = run(sandbox(), "pair");
    expect(answer.stderr).toContain("unknown verb pair");
    expect(answer.status).toBe(2);
  });

  test("--help lists the verb, exit 0", () => {
    const answer = run(sandbox(), "--help");
    expect(answer.stdout).toContain("  doctor");
    expect(answer.status).toBe(0);
  });

  test("doctor reports and never gates, exit 0", () => {
    const root = sandbox();
    const answer = run(root, "doctor", "--root", root, "--json");
    expect(answer.status).toBe(0);
    expect(JSON.parse(answer.stdout).code).toBe("ok");
  });

  test("a --root that is not there is missing, exit 4", () => {
    const root = sandbox();
    const answer = run(root, "doctor", "--root", join(root, "nowhere"));
    expect(answer.status).toBe(4);
    expect(answer.stderr).toContain("is not a directory");
  });
});
