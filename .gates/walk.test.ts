import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { manifestlessPlugins } from "./walk.ts";

const plugins = mkdtempSync(join(tmpdir(), "qsm-walk-"));
afterAll(() => {
  rmSync(plugins, { recursive: true, force: true });
});

describe("manifestless plugins", () => {
  test("a plugin directory without .claude-plugin/plugin.json is named", () => {
    mkdirSync(join(plugins, "qsm-whole/.claude-plugin"), { recursive: true });
    writeFileSync(join(plugins, "qsm-whole/.claude-plugin/plugin.json"), "{}");
    mkdirSync(join(plugins, "qsm-half/openspec"), { recursive: true });
    expect(manifestlessPlugins(plugins)).toEqual(["qsm-half"]);
  });
});
