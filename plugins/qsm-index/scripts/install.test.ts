// semble thickens an index but never gates one, so a missing one is a suggestion with its
// command. graphify gates it: one older than 0.8.34 is upgraded by the install, and "already" is
// the answer only for a new enough one. The whole installer runs in a sandbox home.

import { describe, expect, test } from "bun:test";
import { fakeInstall } from "../../../lib/fixtures/install.ts";
import { SEMBLE } from "../lib/doctor.ts";
import { graphifyStep, install } from "./install.ts";

describe("graphify step", () => {
  test("a new enough graphify is already, and nothing runs", () => {
    const { ctx, runs } = fakeInstall({ present: () => true });
    expect(graphifyStep(ctx, () => "graphify 0.9.76")).toMatchObject({ status: "already" });
    expect(runs).toEqual([]);
  });

  test("an older graphify is upgraded with uv", () => {
    const { ctx, runs } = fakeInstall({ present: () => true });
    expect(graphifyStep(ctx, () => "graphify 0.8.21")).toMatchObject({ status: "installed" });
    expect(runs).toEqual([["uv", "tool", "install", "-U", "graphifyy"]]);
  });

  test("a failed upgrade is an error naming the command", () => {
    const { ctx } = fakeInstall({ present: () => true, exit: 1 });
    const step = graphifyStep(ctx, () => "");
    expect(step.status).toBe("error");
    expect(step.detail).toContain("uv tool install -U graphifyy");
  });

  test("a dry run plans the upgrade and runs nothing", () => {
    const { ctx, runs } = fakeInstall({ present: () => true, dryRun: true });
    expect(graphifyStep(ctx, () => "graphify 0.8.21")).toMatchObject({ status: "skipped" });
    expect(runs).toEqual([]);
  });
});

describe("install", () => {
  test("semble missing is a suggestion carrying its install command", async () => {
    const r = await install(fakeInstall({ dryRun: true }).ctx);
    const step = r.steps.find((s) => s.name === `upstream ${SEMBLE.bin}`);
    expect(step).toMatchObject({ status: "suggested" });
    expect(step?.detail).toContain(SEMBLE.install);
  }, 60_000);
});
