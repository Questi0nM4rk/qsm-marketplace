import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { sandboxDir, writeIn } from "../../../lib/fixtures/sandbox.ts";
import { isRecord } from "../../../lib/outcome.ts";
import {
  changedKeys,
  guardedSnapshot,
  readUserSettings,
  routerDamage,
  routerModel,
  withTeammateCommand,
} from "./settings.ts";

const GATEWAY = { address: "http://127.0.0.1:3456", key: "gw-key" };

describe("router values in user settings", () => {
  test("an env value at the router's address is damage, in any loopback spelling", () => {
    expect(
      routerDamage({ env: { ANTHROPIC_BASE_URL: "http://localhost:3456/v1" } }, GATEWAY),
    ).toEqual(["env.ANTHROPIC_BASE_URL"]);
  });

  test("an env value equal to the gateway key is damage", () => {
    expect(routerDamage({ env: { ANTHROPIC_API_KEY: "gw-key" } }, GATEWAY)).toEqual([
      "env.ANTHROPIC_API_KEY",
    ]);
  });

  test("an apiKeyHelper naming CCR is damage even without a known gateway", () => {
    expect(
      routerDamage({
        apiKeyHelper: "/h/.claude-code-router/bin/ccr-claude-code-api-key",
      }),
    ).toEqual(["apiKeyHelper"]);
  });

  test("another port and other keys are not damage", () => {
    expect(
      routerDamage(
        { env: { FOO_URL: "http://127.0.0.1:9999", FOO: "gw" }, model: "opus" },
        GATEWAY,
      ),
    ).toEqual([]);
  });

  test("the base url, api key and auth token keys are damage with no gateway known", () => {
    expect(
      routerDamage({
        env: {
          ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
          ANTHROPIC_API_KEY: "x",
          ANTHROPIC_AUTH_TOKEN: "y",
          FOO: "1",
        },
      }),
    ).toEqual(["env.ANTHROPIC_BASE_URL", "env.ANTHROPIC_API_KEY", "env.ANTHROPIC_AUTH_TOKEN"]);
  });

  test("a non-loopback router host and a key inside another value are damage", () => {
    const remote = { address: "http://router.lan:3456", key: "gw-key" };
    expect(
      routerDamage({ env: { OTHER_URL: "http://router.lan:3456/v1", H: "Bearer gw-key" } }, remote),
    ).toEqual(["env.OTHER_URL", "env.H"]);
  });

  test("an apiKeyHelper that cats a ccr key file is damage; a word merely containing ccr is not", () => {
    expect(routerDamage({ apiKeyHelper: "cat ~/.ccr_key" })).toEqual(["apiKeyHelper"]);
    expect(routerDamage({ apiKeyHelper: "pass show accra" })).toEqual([]);
  });
});

describe("a router model in user settings", () => {
  test("a <provider>,<slug> pair, a gateway id and a catalog slug are router models", () => {
    expect(routerModel({ model: "codex-api,gpt-6.1" }, [])).toBe("codex-api,gpt-6.1");
    expect(routerModel({ model: "anthropic/claude-ccr-0a1b" }, [])).toBe(
      "anthropic/claude-ccr-0a1b",
    );
    expect(routerModel({ model: "gpt-6.1" }, ["gpt-6.1"])).toBe("gpt-6.1");
  });

  test("a hidden catalog slug is a router model too", () => {
    // the caller passes every catalog slug and the allowlist, not only the listed ones
    expect(routerModel({ model: "gpt-6.1-mini" }, ["gpt-6.1", "gpt-6.1-mini"])).toBe(
      "gpt-6.1-mini",
    );
  });

  test("a Claude alias is not", () => {
    expect(routerModel({ model: "opus" }, ["gpt-6.1"])).toBeUndefined();
  });
});

describe("the guarded keys before and after a start", () => {
  test("a changed env key, a new apiKeyHelper and a changed model are named", () => {
    const before = guardedSnapshot({
      env: { A: "1" },
      model: "opus",
      theme: "dark",
    });
    const after = guardedSnapshot({
      env: { A: "2" },
      model: "x",
      apiKeyHelper: "h",
      theme: "light",
    });
    expect(changedKeys(before, after)).toEqual(["apiKeyHelper", "env.A", "model"]);
  });
});

describe("reading and writing user settings", () => {
  test("a file that does not parse is failed naming the file", () => {
    const dir = sandboxDir("qsm-ccr-set-");
    writeIn(dir, "settings.json", "{ nope");
    const r = readUserSettings(join(dir, "settings.json"));
    expect(r.code).toBe("failed");
    expect(r.message).toContain(join(dir, "settings.json"));
  });

  test("the teammate command is added to env and every other key kept; a second write is null", () => {
    const dir = sandboxDir("qsm-ccr-set-");
    writeIn(dir, "settings.json", JSON.stringify({ model: "opus", env: { KEEP: "1" } }));
    const read = readUserSettings(join(dir, "settings.json")).data;
    if (read === undefined) {
      throw new Error("unreadable");
    }
    const text = withTeammateCommand(read, "/bin/qsm-ccr");
    const written: unknown = JSON.parse(text ?? "");
    expect(written).toEqual({
      model: "opus",
      env: { KEEP: "1", CLAUDE_CODE_TEAMMATE_COMMAND: "/bin/qsm-ccr" },
    });
    if (!isRecord(written)) {
      throw new Error("the settings text is not an object");
    }
    expect(withTeammateCommand({ ...read, json: written }, "/bin/qsm-ccr")).toBeNull();
  });
});
