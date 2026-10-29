// The measuring verbs read images through the image tool, so it is required;
// only the capture verbs need the screenshot tool, so that one is a suggestion.
// The whole installer runs in a sandbox home.

import { describe, expect, test } from "bun:test";
import { fakeInstall } from "../../../lib/fixtures/install.ts";
import type { Step } from "../../../lib/install-contract.ts";
import { IMAGE_TOOL, SCREENSHOT_TOOL } from "../lib/capture.ts";
import { install } from "./install.ts";

function step(steps: readonly Step[], cmd: string): Step | undefined {
  return steps.find((s) => s.name === `upstream ${cmd}`);
}

describe("install", () => {
  test("no screenshot tool is a suggestion", async () => {
    const r = await install(fakeInstall({ present: ["bun", IMAGE_TOOL, "wtype"] }).ctx);
    expect(r.status).toBe("suggested");
    expect(step(r.steps, SCREENSHOT_TOOL)).toMatchObject({ status: "suggested" });
  }, 60_000);

  test("no key sender is a missing prerequisite naming the pacman line", async () => {
    const r = await install(fakeInstall({ present: ["bun", SCREENSHOT_TOOL, IMAGE_TOOL] }).ctx);
    expect(r.status).toBe("missing-prereq");
    expect(step(r.steps, "wtype")).toMatchObject({ status: "missing-prereq" });
    expect(JSON.stringify(r.steps)).toContain("sudo pacman -S wtype");
  }, 60_000);

  test("no image tool is a missing prerequisite", async () => {
    const r = await install(fakeInstall({ present: ["bun", SCREENSHOT_TOOL, "wtype"] }).ctx);
    expect(r.status).toBe("missing-prereq");
    expect(step(r.steps, IMAGE_TOOL)).toMatchObject({ status: "missing-prereq" });
  }, 60_000);
});
