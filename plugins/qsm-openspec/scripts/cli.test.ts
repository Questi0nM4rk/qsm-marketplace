// These run the binary's own entry point, the same one the compiled binary wraps, so a refactor
// of the report or of the argument handling cannot quietly break the CLI.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runBin } from "../../../lib/fixtures/cli.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

const CLI = join(import.meta.dir, "cli.ts");

// Every sandbox this file makes is removed after the test that made it,
// passing or failing: a `finally` inside one test would leave the rest.
function run(cwd: string, ...args: string[]): ReturnType<typeof runBin> {
  return runBin(CLI, args, { cwd });
}

describe("verbs", () => {
  test("an unknown verb exits 2 and names the usage", () => {
    const answer = run(sandboxDir("qsm-openspec-cli-"), "pair");
    expect(answer.stderr).toContain("unknown verb pair");
    expect(answer.exit).toBe(2);
  });

  test("--help lists the verb, exit 0", () => {
    const answer = run(sandboxDir("qsm-openspec-cli-"), "--help");
    expect(answer.stdout).toContain("  doctor");
    expect(answer.exit).toBe(0);
  });

  test("doctor reports and never gates, exit 0", () => {
    const root = sandboxDir("qsm-openspec-cli-");
    const answer = run(root, "doctor", "--root", root, "--json");
    expect(answer.exit).toBe(0);
    const envelope: unknown = JSON.parse(answer.stdout);
    expect(envelope).toMatchObject({ code: "ok" });
  });

  test("a --root that is not there is missing, exit 4", () => {
    const root = sandboxDir("qsm-openspec-cli-");
    const answer = run(root, "doctor", "--root", join(root, "nowhere"));
    expect(answer.exit).toBe(4);
    expect(answer.stderr).toContain("is not a directory");
  });
});
