import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { getState, openDb } from "../lib/store.ts";
import { activation, harnessMemoryStep, withHarnessMemoryOff } from "./activate.ts";

/** The archive lives beside the Claude home, so a test reads the choice the activation recorded. */
const archiveOf = (claudeHome: string) => join(claudeHome, "memory.db");

function context(claudeHome: string, memory = "qsm", dryRun = false) {
  return {
    dryRun,
    env: { CLAUDE_CONFIG_DIR: claudeHome, QSM_MEMORY_DB: archiveOf(claudeHome) },
    choices: { memory },
  };
}
/** The activation answers synchronously; the contract allows a promise, so await it. */
const activate = (ctx: ReturnType<typeof context>) => activation.activate(ctx);

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
      cleanupPeriodDays: 36500,
    });
    expect(result.detail).toContain(settings);
  });

  test("qsm raises a deleting cleanupPeriodDays, because a transcript is the person's", async () => {
    const { claudeHome, settings } = sandbox('{ "cleanupPeriodDays": 3 }');

    await activate(context(claudeHome));

    expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual({
      cleanupPeriodDays: 36500,
      autoMemoryEnabled: false,
    });
  });

  test("qsm leaves a longer retention alone", async () => {
    const { claudeHome, settings } = sandbox('{ "cleanupPeriodDays": 99999 }');

    await activate(context(claudeHome));

    expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual({
      cleanupPeriodDays: 99999,
      autoMemoryEnabled: false,
    });
  });

  test("running it again with nothing changed is already", async () => {
    const { claudeHome } = sandbox('{ "autoMemoryEnabled": false, "cleanupPeriodDays": 36500 }');

    // the keys alone are not enough: the choice must be recorded too
    expect((await activate(context(claudeHome))).status).toBe("installed");
    expect((await activate(context(claudeHome))).status).toBe("already");
  });

  test("a dry run writes nothing and names the file", async () => {
    const { claudeHome, settings } = sandbox('{ "outputStyle": "qsm" }');

    const result = await activate(context(claudeHome, "qsm", true));

    expect(result.status).toBe("skipped");
    expect(result.detail).toContain(
      `would write autoMemoryEnabled: false, cleanupPeriodDays: 36500 into ${settings}`,
    );
    expect(readFileSync(settings, "utf8")).toBe('{ "outputStyle": "qsm" }');
  });

  test("qsm records the choice and the day, and a second run keeps the day", async () => {
    const { claudeHome } = sandbox();

    await activate(context(claudeHome));
    const db = openDb(archiveOf(claudeHome));
    const first = getState(db, "activated_at");
    db.query(
      "UPDATE state SET value = '2026-09-01T00:00:00.000Z' WHERE key = 'activated_at'",
    ).run();
    const again = await activate(context(claudeHome));

    expect(getState(db, "retention")).toBe("qsm");
    expect(first).not.toBeNull();
    expect(again.status).toBe("already");
    expect(getState(db, "activated_at")).toBe("2026-09-01T00:00:00.000Z");
  });

  test("claude records the choice and leaves settings.json byte for byte", async () => {
    const text = '{ "cleanupPeriodDays": 30 }';
    const { claudeHome, settings } = sandbox(text);

    const result = await activate(context(claudeHome, "claude"));

    expect(result.status).toBe("installed");
    expect(readFileSync(settings, "utf8")).toBe(text);
    expect(getState(openDb(archiveOf(claudeHome)), "retention")).toBe("claude");
    expect((await activate(context(claudeHome, "claude"))).status).toBe("already");
  });

  test("status: activated under claude, or under qsm with both keys; absent otherwise", async () => {
    const claude = sandbox('{ "cleanupPeriodDays": 30 }');
    expect(activation.status(context(claude.claudeHome).env)).toBe("absent");
    await activate(context(claude.claudeHome, "claude"));
    expect(activation.status(context(claude.claudeHome).env)).toBe("activated");

    const qsm = sandbox();
    await activate(context(qsm.claudeHome));
    expect(activation.status(context(qsm.claudeHome).env)).toBe("activated");
    writeFileSync(qsm.settings, '{ "autoMemoryEnabled": false, "cleanupPeriodDays": 30 }');
    expect(activation.status(context(qsm.claudeHome).env)).toBe("absent");

    // the keys alone, with no recorded choice, are not an activation
    const keysOnly = sandbox('{ "autoMemoryEnabled": false, "cleanupPeriodDays": 36500 }');
    expect(activation.status(context(keysOnly.claudeHome).env)).toBe("absent");
  });

  test("an unknown memory value is an error and writes nothing", async () => {
    const { claudeHome, settings } = sandbox();

    expect((await activate(context(claudeHome, "skip"))).status).toBe("error");
    expect(existsSync(settings)).toBe(false);
  });
});

describe("the settings file itself", () => {
  test("no settings.json yet: created with the two keys", async () => {
    const { claudeHome, settings } = sandbox();

    expect((await activate(context(claudeHome))).status).toBe("installed");
    expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual({
      autoMemoryEnabled: false,
      cleanupPeriodDays: 36500,
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
    expect(
      withHarnessMemoryOff('{"autoMemoryEnabled":false,"cleanupPeriodDays":36500}'),
    ).toBeNull();
    expect(withHarnessMemoryOff('{"autoMemoryEnabled":false,"cleanupPeriodDays":30}')).toContain(
      '"cleanupPeriodDays": 36500',
    );
    expect(JSON.parse(withHarnessMemoryOff('{"autoMemoryEnabled":true,"a":[1]}') ?? "")).toEqual({
      autoMemoryEnabled: false,
      cleanupPeriodDays: 36500,
      a: [1],
    });
  });

  test("memory takes qsm or claude", () => {
    expect(activation.options).toEqual([
      expect.objectContaining({ name: "memory", values: ["qsm", "claude"] }),
    ]);
  });
});
