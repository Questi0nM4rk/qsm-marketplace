// The install base compiles the three classic hooks hooks.json declares; that
// side of `install()` is proved once, for every plugin, by
// lib/install-base.test.ts against a fixture, not here. What is worth this
// plugin's own test is the one thing the base cannot know on its own:
// whether `wt` is there, and the line that puts it there. So each test here
// reads the "upstream wt" step alone, never the overall status, which also
// carries whatever the hook compiles happened to report on that run. The
// version and flag check that decides whether a `wt` can actually serve the
// create path lives in the hooks module's doctor command, which is where a
// broken workspace is noticed.

import { describe, expect, test } from "bun:test";
import { fakeInstall } from "../../../lib/fixtures/install.ts";
import type { InstallContext, Step } from "../../../lib/install-contract.ts";
import { INSTALL_HINT } from "../lib/doctor.ts";
import { install } from "./install.ts";

function context(present: readonly string[], dryRun = false): InstallContext {
  return fakeInstall({ present, dryRun }).ctx;
}

function wtStep(steps: readonly Step[] | undefined): Step | undefined {
  return steps?.find((s) => s.name === "upstream wt");
}

describe("install", () => {
  test("wt on PATH: nothing to do", async () => {
    const r = await install(context(["bun", "wt"]));
    expect(wtStep(r.steps)).toMatchObject({ status: "already" });
  });

  test("wt missing: a missing prerequisite, and the detail carries the command to run", async () => {
    const r = await install(context(["bun"]));
    expect(r.status).toBe("missing-prereq");
    expect(wtStep(r.steps)?.detail).toBe(`wt is not on PATH: ${INSTALL_HINT}`);
  });

  test("a dry run names the probe and writes nothing", async () => {
    const r = await install(context(["bun"], true));
    expect(r.status).toBe("skipped");
    expect(r.detail).toContain("would need wt");
  });
});
