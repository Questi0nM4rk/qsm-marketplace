import { describe, expect, test } from "bun:test";
import { fakeInstall } from "../../../lib/fixtures/install.ts";
import { install } from "./install.ts";

describe("install", () => {
  test("a fresh machine without CCR: missing-prereq naming the router's install, and nothing ran", async () => {
    const fake = fakeInstall({ present: ["bun", "claude", "codex"] });
    const r = await install(fake.ctx);
    const step = r.steps.find((s) => s.name === "upstream ccr");
    expect(step?.status).toBe("missing-prereq");
    expect(step?.detail).toContain("@musistudio/claude-code-router");
    expect(r.steps.find((s) => s.name === "bin qsm-ccr")?.status).toBe("installed");
    expect(fake.runs).toEqual([]);
  }, 120_000);
});
