// What this install owes the user is br on PATH. The shared base probes it, so these tests pin
// what is declared: the tool, and the line to type, because no command here installs it.

import { describe, expect, test } from "bun:test";
import { fakeInstall } from "../../../lib/fixtures/install.ts";
import { install } from "./install.ts";

describe("install", () => {
  test("br present: nothing to do", async () => {
    const r = await install(fakeInstall({ present: ["bun", "br"] }).ctx);
    expect(r.status).toBe("already");
  });

  test("br missing is a missing prerequisite named with its command, and nothing runs", async () => {
    const { ctx, runs } = fakeInstall({ present: ["bun"] });
    const r = await install(ctx);
    const step = r.steps?.find((s) => s.name === "upstream br");
    expect(step).toMatchObject({ status: "missing-prereq" });
    expect(step?.detail).toContain("beads_rust");
    expect(runs).toHaveLength(0);
  });
});
