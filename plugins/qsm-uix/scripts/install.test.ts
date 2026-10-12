// The measuring verbs read images through the image tool, so it is required;
// only the capture verbs need the screenshot tool, so that one is a suggestion.
// The whole installer runs in a sandbox home.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InstallContext, Step } from "../../../lib/install-contract.ts";
import { IMAGE_TOOL, SCREENSHOT_TOOL } from "../lib/capture.ts";
import { install } from "./install.ts";

const sandbox = mkdtempSync(join(tmpdir(), "qsm-uix-install-"));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

function context(present: readonly string[]): InstallContext {
  return {
    dryRun: false,
    env: { HOME: sandbox, QSM_BIN_DIR: join(sandbox, "bin"), XDG_CONFIG_HOME: sandbox },
    probe: (cmd) => present.includes(cmd),
    run: () => 0,
  };
}

function step(steps: readonly Step[], cmd: string): Step | undefined {
  return steps.find((s) => s.name === `upstream ${cmd}`);
}

describe("install", () => {
  test("no screenshot tool is a suggestion", async () => {
    const r = await install(context(["bun", IMAGE_TOOL, "wtype"]));
    expect(r.status).toBe("suggested");
    expect(step(r.steps, SCREENSHOT_TOOL)).toMatchObject({ status: "suggested" });
  }, 60_000);

  test("no key sender is a missing prerequisite naming the pacman line", async () => {
    const r = await install(context(["bun", SCREENSHOT_TOOL, IMAGE_TOOL]));
    expect(r.status).toBe("missing-prereq");
    expect(step(r.steps, "wtype")).toMatchObject({ status: "missing-prereq" });
    expect(JSON.stringify(r.steps)).toContain("sudo pacman -S wtype");
  }, 60_000);

  test("no image tool is a missing prerequisite", async () => {
    const r = await install(context(["bun", SCREENSHOT_TOOL, "wtype"]));
    expect(r.status).toBe("missing-prereq");
    expect(step(r.steps, IMAGE_TOOL)).toMatchObject({ status: "missing-prereq" });
  }, 60_000);
});
