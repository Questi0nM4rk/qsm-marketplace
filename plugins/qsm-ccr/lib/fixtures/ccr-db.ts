// The fake CCR config: CCR 3's app_config row, built here so no test opens the person's router.
// Fixture slugs are fictional; plugin code holds no model id.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { isRecord } from "../../../../lib/outcome.ts";
import { type Json, parseJson } from "../parse.ts";

export const GATEWAY_KEY = "gw-test-key-0000";
export const REFRESH = "rt-codex-refresh-1111";
export const OLD_ACCESS = "at-old-2222";
export const OLD_REFRESH = "rt-old-3333";

export function createCcrDb(path: string, value: Json): void {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.run(
    "CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT)",
  );
  db.query(
    "INSERT OR REPLACE INTO app_config (key, value_json, updated_at) VALUES ('default', ?, datetime('now'))",
  ).run(JSON.stringify(value));
  db.close();
}

export function readCcrValue(path: string): Json {
  const db = new Database(path, { readonly: true });
  try {
    const row = db
      .query<{ v: string }, []>(
        "SELECT CAST(value_json AS TEXT) AS v FROM app_config WHERE key = 'default'",
      )
      .get();
    const parsed = parseJson(row?.v ?? "null");
    if (!isRecord(parsed)) {
      throw new Error(`${path} holds no CCR config`);
    }
    return parsed;
  } finally {
    db.close();
  }
}

/** The objects in the list at `key`, none when it holds anything else. */
export function recordsAt(value: Json, key: string): Json[] {
  const list = value[key];
  return Array.isArray(list) ? list.filter(isRecord) : [];
}

/** One of CCR's Codex OAuth plugins as its import writes them, with the tokens of the spike. */
function oauthPlugin(key: string, providerName: string): Json {
  return {
    key,
    providerName,
    request: { bodyRemove: ["max_output_tokens"] },
    codexOauth: {
      accessToken: OLD_ACCESS,
      refreshToken: OLD_REFRESH,
      refreshIfMissingAccessToken: true,
      required: true,
    },
  };
}

/** The config the spike ended with; `fresh` is CCR's own default (both profiles global, no codex). */
export function ccrConfig(port: number, opts: { fresh?: true } = {}): Json {
  const profiles = [
    {
      id: "default-claude-code",
      agent: "claude-code",
      enabled: true,
      scope: "global",
      settingsFile: "~/.claude/settings.json",
    },
    {
      id: "default-codex",
      agent: "codex",
      enabled: true,
      scope: "global",
      configFile: "~/.codex/config.toml",
    },
  ];
  if (opts.fresh === true) {
    return {
      APIKEY: "",
      APIKEYS: [],
      HOST: "127.0.0.1",
      PORT: port,
      CUSTOM_ROUTER_PATH: "",
      Providers: [],
      Router: {},
      providerPlugins: [],
      profile: { enabled: true, profiles },
    };
  }
  return {
    APIKEY: GATEWAY_KEY,
    APIKEYS: [],
    HOST: "127.0.0.1",
    PORT: port,
    CUSTOM_ROUTER_PATH: "",
    // Recorded from CCR's own Codex import: the slug in `id`, the display name in `name`, and two
    // OAuth plugins, one named after the display name and one after the internal `<slug>::<type>`.
    Providers: [
      {
        id: "codex-api",
        name: "Codex API",
        type: "openai_responses",
        baseUrl: "https://codex.example/backend-api",
        apiKey: "ccr-local-agent-login",
        models: ["gpt-6.1-sol", "gpt-6.1"],
      },
    ],
    Router: { builtInRules: { "claude-code": { enabled: true } } },
    providerPlugins: [
      oauthPlugin("ccr-local-agent-codex-api-codex-oauth", "Codex API"),
      oauthPlugin("ccr-local-agent-codex-api-codex-oauth-internal", "codex-api::openai_responses"),
    ],
    profile: {
      enabled: true,
      profiles: profiles.map((p) => ({ ...p, scope: "ccr", enabled: false })),
    },
    untouched: { nested: [1, { deep: "kept" }] },
  };
}

/** `base` with CCR's PascalCase fields set: the one place a test spells them. */
export function withCcrFields(
  base: Json,
  fields: { readonly providers?: unknown; readonly router?: unknown },
): Json {
  return {
    ...base,
    ...(fields.providers === undefined ? {} : { Providers: fields.providers }),
    ...(fields.router === undefined ? {} : { Router: fields.router }),
  };
}

/** CCR with the codex-api provider allowing only `models`. */
export function ccrAllowing(port: number, models: readonly string[]): Json {
  return withCcrFields(ccrConfig(port), {
    providers: [{ id: "codex-api", name: "Codex API", models }],
  });
}

/** CCR before its Codex import: no codex-api provider and no OAuth plugin. */
export function ccrWithoutCodex(): Json {
  return { ...withCcrFields(ccrConfig(0), { providers: [] }), providerPlugins: [] };
}

export function catalogJson(at: Date = new Date()): Json {
  return {
    fetched_at: at.toISOString(),
    client_version: "0.0.0-test",
    models: [
      {
        slug: "gpt-6.1-sol",
        visibility: "list",
        priority: 1,
        context_window: 400_000,
      },
      {
        slug: "gpt-6.1",
        visibility: "list",
        priority: 2,
        context_window: 272_000,
      },
      {
        slug: "gpt-6.1-mini",
        visibility: "hide",
        priority: 0,
        context_window: 128_000,
      },
    ],
  };
}

/** A token shaped like codex's access token: a JWT whose payload carries `exp` (seconds). */
export function jwt(expSeconds: number, tag: string): string {
  return `${base64Json({ alg: "none" })}.${base64Json({ exp: expSeconds, tag })}.sig-${tag}`;
}

function base64Json(o: Json): string {
  return Buffer.from(JSON.stringify(o)).toString("base64url");
}
