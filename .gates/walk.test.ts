import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandboxDir } from "../lib/fixtures/sandbox.ts";
import { manifestlessPlugins } from "./walk.ts";

describe("manifestless plugins", () => {
  test("a plugin directory without .claude-plugin/plugin.json is named", () => {
    const plugins = sandboxDir("qsm-walk-");
    mkdirSync(join(plugins, "qsm-whole/.claude-plugin"), { recursive: true });
    writeFileSync(join(plugins, "qsm-whole/.claude-plugin/plugin.json"), "{}");
    mkdirSync(join(plugins, "qsm-half/openspec"), { recursive: true });
    expect(manifestlessPlugins(plugins)).toEqual(["qsm-half"]);
  });
});
