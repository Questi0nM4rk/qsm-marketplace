import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { activation, harnessMemoryStep, withHarnessMemoryOff } from "./activate.ts";

function context(claudeHome: string, memory = "qsm", dryRun = false) {
  return { dryRun, env: { CLAUDE_CONFIG_DIR: claudeHome }, choices: { memory } };
}
/** The activation answers synchronously; the contract allows a promise, so await it. */
const activate = async (ctx: ReturnType<typeof context>) => await activation.activate(ctx);

function sandbox(settings?: string): { claudeHome: string; settings: string } {
  const claudeHome = sandboxDir("qsm-claude-");
  const path = join(claudeHome, "settings.json");
  if (settings !== undefined) {
    writeFileSync(path, settings);
  }
  return { claudeHome, settings: path };
}

describe("the harness memory choice", () => {
  test("qsm turns the harness memory off and keeps every other key", async () => {
    const { claudeHome, settings } = sandbox('{\n  "outputStyle": "qsm",\n  "model": "opus"\n}\n');

    const result = await activate(context(claudeHome));

    expect(result.status).toBe("installed");
    expect(result.steps).toHaveLength(1);
    expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual({
      outputStyle: "qsm",
      model: "opus",
      autoMemoryEnabled: false,
      cleanupPeriodDays: 7,
    });
    expect(result.detail).toContain(settings);
  });

  test("qsm leaves a lower cleanupPeriodDays alone", async () => {
    const { claudeHome, settings } = sandbox('{ "cleanupPeriodDays": 3 }');

    await activate(context(claudeHome));

    expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual({
      cleanupPeriodDays: 3,
      autoMemoryEnabled: false,
    });
  });

  test("running it again with nothing changed is already", async () => {
    const { claudeHome } = sandbox('{ "autoMemoryEnabled": false, "cleanupPeriodDays": 7 }');

    expect((await activate(context(claudeHome))).status).toBe("already");
  });

  test("a dry run writes nothing and names the file", async () => {
    const { claudeHome, settings } = sandbox('{ "outputStyle": "qsm" }');

    const result = await activate(context(claudeHome, "qsm", true));

    expect(result.status).toBe("skipped");
    expect(result.detail).toContain(
      `would write autoMemoryEnabled: false, cleanupPeriodDays: 7 into ${settings}`,
    );
    expect(readFileSync(settings, "utf8")).toBe('{ "outputStyle": "qsm" }');
  });

  test("skip writes nothing", async () => {
    const { claudeHome, settings } = sandbox();

    expect((await activate(context(claudeHome, "skip"))).status).toBe("skipped");
    expect(existsSync(settings)).toBe(false);
  });
});

describe("the settings file itself", () => {
  test("no settings.json yet: created with the two keys", async () => {
    const { claudeHome, settings } = sandbox();

    expect((await activate(context(claudeHome))).status).toBe("installed");
    expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual({
      autoMemoryEnabled: false,
      cleanupPeriodDays: 7,
    });
  });

  test("settings.json that does not parse is an error naming the file", () => {
    const { claudeHome, settings } = sandbox("{ not json");

    const step = harnessMemoryStep(context(claudeHome));

    expect(step.status).toBe("error");
    expect(step.detail).toContain(settings);
    expect(readFileSync(settings, "utf8")).toBe("{ not json");
  });

  test("the rewrite touches two keys and keeps the rest", () => {
    expect(withHarnessMemoryOff('{"autoMemoryEnabled":false,"cleanupPeriodDays":5}')).toBeNull();
    expect(withHarnessMemoryOff('{"autoMemoryEnabled":false,"cleanupPeriodDays":30}')).toContain(
      '"cleanupPeriodDays": 7',
    );
    expect(JSON.parse(withHarnessMemoryOff('{"autoMemoryEnabled":true,"a":[1]}') ?? "")).toEqual({
      autoMemoryEnabled: false,
      cleanupPeriodDays: 7,
      a: [1],
    });
  });

  test("memory takes qsm or skip", () => {
    expect(activation.options).toEqual([
      expect.objectContaining({ name: "memory", values: ["qsm", "skip"] }),
    ]);
  });
});
