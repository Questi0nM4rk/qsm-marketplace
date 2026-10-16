// `qsm-usage drop` and `dropped` through the real binary, state under a sandbox dir.

import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isolatedEnv, runBin } from "../../../lib/fixtures/cli.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

const CLI = resolve(import.meta.dir, "cli.ts");

function run(state: string, args: string[]) {
  return runBin(CLI, args, {
    env: isolatedEnv(sandboxDir("qsm-usage-home-"), { QSM_SETUP_STATE_DIR: state }),
  });
}

describe("qsm-usage drop", () => {
  test("a dropped finding is listed once, however often it is dropped", () => {
    const state = sandboxDir("qsm-usage-dropped-test-");
    expect(run(state, ["dropped"]).stdout.trim()).toBe("");
    expect(run(state, ["drop", "unused-extensions:skill pdf-tools"]).exit).toBe(0);
    expect(run(state, ["drop", "unused-extensions:skill pdf-tools"]).exit).toBe(0);
    expect(run(state, ["drop", "duplicates:rule a"]).exit).toBe(0);
    expect(run(state, ["dropped"]).stdout.trim().split("\n")).toEqual([
      "unused-extensions:skill pdf-tools",
      "duplicates:rule a",
    ]);
  });

  test("a key that is not topic:target is a broken call", () => {
    const ran = run(sandboxDir("qsm-usage-dropped-test-"), ["drop", "nothing"]);
    expect(ran.exit).toBe(2);
  });

  test("a damaged file fails loud instead of reading as empty", () => {
    const state = sandboxDir("qsm-usage-dropped-test-");
    run(state, ["drop", "duplicates:rule a"]);
    writeFileSync(join(state, "usage", "dropped.json"), "{}");
    expect(run(state, ["dropped"]).exit).toBe(1);
  });
});
