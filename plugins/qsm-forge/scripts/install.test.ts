// gh and glab are alternatives: either one lets the plugin's first command run, and only neither
// is a missing prerequisite. The whole installer runs here, in a sandbox home.

import { describe, expect, test } from "bun:test";
import { fakeInstall } from "../../../lib/fixtures/install.ts";
import { install } from "./install.ts";

describe("install", () => {
  test("one forge CLI is enough", async () => {
    const r = await install(fakeInstall({ present: ["bun", "glab"] }).ctx);
    expect(r.status).toBe("installed");
    expect(r.steps.find((s) => s.name.startsWith("upstream"))).toMatchObject({ status: "already" });
  }, 60_000);

  test("neither forge CLI is one missing prerequisite naming both", async () => {
    const r = await install(fakeInstall({ present: ["bun"] }).ctx);
    expect(r.status).toBe("missing-prereq");
    const upstream = r.steps.filter((s) => s.name.startsWith("upstream"));
    expect(upstream).toHaveLength(1);
    expect(upstream[0]?.detail).toContain("gh or glab is not on PATH");
  }, 60_000);

  test("a dry run says what it would need", async () => {
    const r = await install(fakeInstall({ present: ["bun"], dryRun: true }).ctx);
    expect(r.steps.find((s) => s.name.startsWith("upstream"))?.detail).toContain("gh or glab");
  });
});
