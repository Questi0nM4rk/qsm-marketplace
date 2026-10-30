// CCR's config: one JSON value in its sqlite (app_config, key default, column value_json). CCR
// owns the schema; qsm-ccr reads it and changes only the fields a requirement names: the
// allowlist, the codex-api token copies, the profiles' scope and enabled.
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { isRecord } from "../../../lib/outcome.ts";
import type { CatalogModel } from "./catalog.ts";
import { type Json, parseJson, parseOrName } from "./parse.ts";
import type { Gateway, ModelsOf } from "./route.ts";

const ROW = "default";

function obj(v: unknown): Json {
  return isRecord(v) ? v : {};
}
function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** CCR's own daemon and UI write this database too: a wait instead of a raw "database is locked". */
const BUSY_MS = 5000;

function openDb(dbPath: string, readonly: boolean): Database {
  const db = readonly ? new Database(dbPath, { readonly: true }) : new Database(dbPath);
  db.run(`PRAGMA busy_timeout = ${BUSY_MS}`);
  return db;
}

const SELECT = "SELECT CAST(value_json AS TEXT) AS v FROM app_config WHERE key = ?";

function parseValue(dbPath: string, text: string): Json {
  return obj(parseOrName(`${dbPath} holds a value_json that`, "JSON", () => parseJson(text)));
}

export function readCcrConfig(dbPath: string): Json | null {
  if (!existsSync(dbPath)) {
    return null;
  }
  const db = openDb(dbPath, true);
  try {
    const row = db.query<{ v: string }, [string]>(SELECT).get(ROW);
    return row === null ? null : parseValue(dbPath, row.v);
  } finally {
    db.close();
  }
}

/** The whole value back, as text: CCR resets its config to defaults, without a word, when
 * value_json is a blob. A compare-and-swap in one write transaction: when the stored value is no
 * longer `before` (CCR saved in between), nothing is written and it throws. */
export function writeCcrConfig(dbPath: string, before: Json, next: Json): void {
  const db = openDb(dbPath, false);
  try {
    db.transaction(() => {
      const row = db.query<{ v: string }, [string]>(SELECT).get(ROW);
      if (row === null) {
        throw new Error(`${dbPath} holds no app_config row '${ROW}'`);
      }
      if (JSON.stringify(parseValue(dbPath, row.v)) !== JSON.stringify(before)) {
        throw new Error(
          `CCR config at ${dbPath} changed while qsm-ccr wrote it (a CCR save in between); nothing was written; run again`,
        );
      }
      db.query("UPDATE app_config SET value_json = CAST(? AS TEXT) WHERE key = ?").run(
        JSON.stringify(next),
        ROW,
      );
    }).immediate();
  } finally {
    db.close();
  }
}

/** The router's URL: 0.0.0.0 and no host are reached on 127.0.0.1, an IPv6 host is bracketed. */
export function addressOf(host: unknown, port: number): string {
  return `http://${bracketed(reachableHost(host))}:${port}`;
}

/** The host a client dials: 0.0.0.0, an empty or a missing host are this machine. */
function reachableHost(host: unknown): string {
  return typeof host === "string" && host !== "" && host !== "0.0.0.0" ? host : "127.0.0.1";
}

/** An IPv6 host goes in brackets in a URL; one already bracketed stays as it is. */
function bracketed(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

/** The gateway of the CCR config in `dbPath`; undefined when there is none or it names none. */
export function gatewayIn(dbPath: string): Gateway | undefined {
  const config = readCcrConfig(dbPath);
  return config === null ? undefined : gatewayOf(config);
}

export function gatewayOf(c: Json): Gateway | undefined {
  // a PORT saved as text is still the port
  const port =
    typeof c.PORT === "string" || typeof c.PORT === "number" ? Number(c.PORT) : Number.NaN;
  const key = c.APIKEY;
  if (!Number.isInteger(port) || port <= 0 || typeof key !== "string" || key === "") {
    return undefined;
  }
  return { address: addressOf(c.HOST, port), key };
}

interface Profile {
  readonly id: string;
  /** CCR's reading: ccr or custom as written, anything else global */
  readonly scope: string;
  readonly enabled: boolean;
}

const NON_GLOBAL = new Set(["ccr", "custom"]);

/** A field read as text: a string or a number as written, anything else as `fallback`. */
function textOf(value: unknown, fallback: string): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function profilesOf(c: Json): Profile[] {
  return list(obj(c.profile).profiles)
    .filter(isRecord)
    .map((p) => ({
      id: textOf(p.id ?? p.name ?? p.agent, "unnamed"),
      scope: NON_GLOBAL.has(String(p.scope)) ? String(p.scope) : "global",
      enabled: p.enabled !== false,
    }));
}

export function globalProfiles(c: Json): string[] {
  return profilesOf(c)
    .filter((p) => p.scope === "global")
    .map((p) => p.id);
}

export function guardHolds(c: Json): boolean {
  return profilesOf(c).every((p) => p.scope !== "global" && !p.enabled);
}

/** Every profile scope ccr and disabled; the claude-code and codex profiles included. */
export function withGuard(c: Json): Json {
  if (!(isRecord(c.profile) && Array.isArray(c.profile.profiles))) {
    return c;
  }
  const profiles = c.profile.profiles.map((p: unknown) =>
    isRecord(p) ? { ...p, scope: "ccr", enabled: false } : p,
  );
  return { ...c, profile: { ...c.profile, profiles } };
}

/** Every file a claude-code profile of CCR would write when global: its settingsFile, else
 * CCR's default, `~` read as HOME the way CCR reads it. CCR's default is always among them. */
export function claudeSettingsFiles(c: Json, home: string): string[] {
  const named = [obj(c.profile).claudeCode, ...list(obj(c.profile).profiles)]
    .filter((p) => isRecord(p) && (p.agent === undefined || p.agent === "claude-code"))
    .map((p) => obj(p).settingsFile)
    .filter((f): f is string => typeof f === "string" && f !== "");
  const files = ["~/.claude/settings.json", ...named].map((f) =>
    resolve(f.startsWith("~/") ? join(home, f.slice(2)) : f),
  );
  return [...new Set(files)];
}

// CCR's import writes the provider's slug to `id` and its display name to `name` ("codex-api",
// "Codex API"), and names each OAuth plugin after the display name or the internal
// `<slug>::<type>` name, so a provider is found by slug and its plugins through the display name.
function providerIndex(c: Json, provider: string): number {
  return list(c.Providers).findIndex((p) => obj(p).id === provider);
}

function isOauthOf(c: Json, p: unknown, provider: string): boolean {
  const name = obj(p).providerName;
  const display = obj(list(c.Providers)[providerIndex(c, provider)]).name;
  return (
    isRecord(obj(p).codexOauth) &&
    typeof name === "string" &&
    (name === display || name.startsWith(`${provider}::`))
  );
}

/** The provider and at least one OAuth plugin for it. */
export function hasProvider(c: Json, provider: string): boolean {
  return (
    providerIndex(c, provider) !== -1 &&
    list(c.providerPlugins).some((p) => isOauthOf(c, p, provider))
  );
}

export function allowlistOf(c: Json, provider: string): string[] {
  const p = obj(list(c.Providers)[providerIndex(c, provider)]);
  return list(p.models).filter((m): m is string => typeof m === "string");
}

export function withAllowlist(c: Json, provider: string, slugs: readonly string[]): Json {
  const at = providerIndex(c, provider);
  if (at === -1) {
    throw new Error(`CCR config has no provider ${provider}`);
  }
  const providers = [...list(c.Providers)];
  providers[at] = { ...obj(providers[at]), models: [...slugs] };
  return { ...c, Providers: providers };
}

export interface CodexTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accountId?: string;
}

interface OauthCopy {
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly accountId?: string;
  readonly refreshIfMissingAccessToken?: boolean;
  readonly required?: boolean;
}

export function oauthCopies(c: Json, provider: string): OauthCopy[] {
  return list(c.providerPlugins)
    .filter((p) => isOauthOf(c, p, provider))
    .map((p) => obj(obj(p).codexOauth) as OauthCopy);
}

export function withTokens(c: Json, provider: string, t: CodexTokens): Json {
  const plugins = list(c.providerPlugins).map((p) => {
    if (!isOauthOf(c, p, provider)) {
      return p;
    }
    const oauth = {
      ...obj(obj(p).codexOauth),
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      ...(t.accountId === undefined ? {} : { accountId: t.accountId }),
    };
    return { ...obj(p), codexOauth: oauth };
  });
  return { ...c, providerPlugins: plugins };
}

/** Which owned field differs: allowlist, tokens, profiles. Never the values. */
export function ownedFieldsChanged(a: Json, b: Json, provider: string): string[] {
  const fields: [string, unknown, unknown][] = [
    ["allowlist", allowlistOf(a, provider), allowlistOf(b, provider)],
    ["tokens", oauthCopies(a, provider), oauthCopies(b, provider)],
    ["profiles", obj(a.profile).profiles, obj(b.profile).profiles],
  ];
  return fields.filter(([, x, y]) => JSON.stringify(x) !== JSON.stringify(y)).map(([name]) => name);
}

const ANTHROPIC_HOST = /(^|\.)anthropic\.com$/i;
const CLAUDE_MODEL = /(^|[,/])claude-(opus|sonnet|haiku|fable|instant|\d)/i;

function walkStrings(v: unknown, path: string, visit: (path: string, value: string) => void): void {
  if (typeof v === "string") {
    visit(path, v);
  } else if (Array.isArray(v)) {
    for (const [i, x] of v.entries()) {
      walkStrings(x, `${path}[${i}]`, visit);
    }
  } else if (isRecord(v)) {
    for (const [k, x] of Object.entries(v)) {
      walkStrings(x, `${path}.${k}`, visit);
    }
  }
}

/** Anything in CCR config that would carry Claude traffic: a provider on Anthropic's API, a route
 * to a Claude model. */
export function claudeTraffic(c: Json): string[] {
  const found: string[] = [];
  for (const p of list(c.Providers).filter(isRecord)) {
    const url = textOf(p.baseUrl ?? p.api_base_url, "");
    try {
      if (ANTHROPIC_HOST.test(new URL(url).hostname)) {
        found.push(`provider ${String(p.name)} (${url})`);
      }
    } catch {
      // no URL, no Anthropic
    }
  }
  walkStrings(c.Router, "Router", (path, value) => {
    if (CLAUDE_MODEL.test(value)) {
      found.push(`route ${path} = ${value}`);
    }
  });
  return found;
}

export function modelsFrom(c: Json, catalog: readonly CatalogModel[]): ModelsOf {
  return (provider) => ({ allowlist: allowlistOf(c, provider), catalog });
}
