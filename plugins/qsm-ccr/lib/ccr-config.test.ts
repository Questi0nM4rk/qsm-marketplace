import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { messageOf } from "../../../lib/outcome.ts";
import {
  allowlistOf,
  claudeTraffic,
  gatewayOf,
  globalProfiles,
  guardHolds,
  oauthCopies,
  ownedFieldsChanged,
  readCcrConfig,
  withAllowlist,
  withGuard,
  withTokens,
  writeCcrConfig,
} from "./ccr-config.ts";
import { ccrConfig, createCcrDb, OLD_REFRESH, withCcrFields } from "./fixtures/ccr-db.ts";

function db(value = ccrConfig(3456)): string {
  const path = join(sandboxDir("qsm-ccr-db-"), "config.sqlite");
  createCcrDb(path, value);
  return path;
}

describe("value_json", () => {
  test("a write stores text and leaves every other field as it was", () => {
    const path = db();
    const before = readCcrConfig(path) ?? {};
    writeCcrConfig(path, before, withAllowlist(before, "codex-api", ["gpt-6.1"]));
    const raw = new Database(path, { readonly: true });
    expect(
      raw
        .query<{ t: string }, []>(
          "SELECT typeof(value_json) AS t FROM app_config WHERE key = 'default'",
        )
        .get()?.t,
    ).toBe("text");
    raw.close();
    const after = readCcrConfig(path) ?? {};
    expect(allowlistOf(after, "codex-api")).toEqual(["gpt-6.1"]);
    const strip = (c: Record<string, unknown>) => withCcrFields(c, { providers: null });
    expect(strip(after)).toEqual(strip(before));
  });

  test("a CCR save between the read and the write is never overwritten", () => {
    const path = db();
    const read = readCcrConfig(path) ?? {};
    const saved = withCcrFields(read, { router: { saved: "by CCR" } });
    createCcrDb(path, saved);
    expect(() => {
      writeCcrConfig(path, read, withAllowlist(read, "codex-api", ["gpt-6.1"]));
    }).toThrow("changed while qsm-ccr wrote it");
    expect(readCcrConfig(path)).toEqual(saved);
  });

  test("a value that does not parse names the database, never the text", () => {
    const path = db();
    const raw = new Database(path);
    raw.run("UPDATE app_config SET value_json = '{\"APIKEY\": sk-secret-6666'");
    raw.close();
    let message = "";
    try {
      readCcrConfig(path);
    } catch (e) {
      message = messageOf(e);
    }
    expect(message).toContain(`${path} holds a value_json that does not parse`);
    expect(message).not.toContain("sk-secret-6666");
  });

  test("a missing file is null", () => {
    expect(readCcrConfig(join(sandboxDir("qsm-ccr-db-"), "config.sqlite"))).toBeNull();
  });
});

describe("the router's identity", () => {
  test("address from HOST and PORT, key from APIKEY", () => {
    expect(gatewayOf(ccrConfig(4567))).toEqual({
      address: "http://127.0.0.1:4567",
      key: "gw-test-key-0000",
    });
  });

  test("a PORT stored as text is still the port; an IPv6 HOST is bracketed", () => {
    expect(gatewayOf({ ...ccrConfig(1), PORT: "4567" })?.address).toBe("http://127.0.0.1:4567");
    expect(gatewayOf({ ...ccrConfig(4567), HOST: "::1" })?.address).toBe("http://[::1]:4567");
  });

  test("no APIKEY is no gateway", () => {
    expect(gatewayOf(ccrConfig(4567, { fresh: true }))).toBeUndefined();
  });
});

describe("profiles", () => {
  test("a profile with no scope is global, as CCR reads it", () => {
    const c = { profile: { profiles: [{ id: "p", enabled: false }] } };
    expect(globalProfiles(c)).toEqual(["p"]);
  });

  test("the guard makes every profile scope ccr and disabled, nothing else", () => {
    const fresh = ccrConfig(1, { fresh: true });
    expect(globalProfiles(fresh)).toEqual(["default-claude-code", "default-codex"]);
    const guarded = withGuard(fresh);
    expect(guardHolds(guarded)).toBe(true);
    expect({ ...guarded, profile: null }).toEqual({ ...fresh, profile: null });
  });
});

describe("tokens", () => {
  test("codex's tokens replace the copies of the codex-api plugin only", () => {
    const c = withTokens(ccrConfig(1), "codex-api", {
      accessToken: "a2",
      refreshToken: "r2",
      accountId: "acct",
    });
    const copy = {
      accessToken: "a2",
      refreshToken: "r2",
      accountId: "acct",
      refreshIfMissingAccessToken: true,
      required: true,
    };
    expect(oauthCopies(c, "codex-api")).toEqual([copy, copy]);
    expect(ownedFieldsChanged(ccrConfig(1), c, "codex-api")).toEqual(["tokens"]);
  });

  test("no change, no field", () => {
    expect(ownedFieldsChanged(ccrConfig(1), ccrConfig(1), "codex-api")).toEqual([]);
    expect(oauthCopies(ccrConfig(1), "codex-api")[0]?.refreshToken).toBe(OLD_REFRESH);
  });
});

describe("Claude traffic", () => {
  test("an Anthropic provider and a route to a Claude model are named", () => {
    const c = withCcrFields(ccrConfig(1), {
      providers: [{ name: "anth", baseUrl: "https://api.anthropic.com/v1" }],
      router: { default: "anth,claude-sonnet-4-5", agent: "claude-code" },
    });
    expect(claudeTraffic(c)).toEqual([
      "provider anth (https://api.anthropic.com/v1)",
      "route Router.default = anth,claude-sonnet-4-5",
    ]);
  });

  test("the codex config carries none", () => {
    expect(claudeTraffic(ccrConfig(1))).toEqual([]);
  });
});
