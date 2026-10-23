import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { guideText, STAGE_SKILLS, STAGES } from "./cockpit.ts";

const PLUGINS = join(import.meta.dir, "..", "..");

// A renamed or removed skill would leave the stage sentence telling the agent to load nothing.
test("every skill a stage sentence names exists in the marketplace", () => {
  const missing = STAGE_SKILLS.filter((skill) => {
    const [plugin = "", name = ""] = skill.split(":");
    return !existsSync(join(PLUGINS, plugin, "skills", name, "SKILL.md"));
  });
  expect(missing).toEqual([]);
});

test("each stage answers one sentence", () => {
  for (const stage of STAGES) {
    const text = guideText(stage);
    console.log(`${stage}: ${Buffer.byteLength(text)} bytes`);
    expect(text.endsWith(".")).toBe(true);
    expect(text.slice(0, -1)).not.toContain(". ");
  }
});
