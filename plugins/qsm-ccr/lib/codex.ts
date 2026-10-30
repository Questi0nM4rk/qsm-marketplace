// codex's own files: auth.json (its tokens), config.toml (its settings), and its catalog refresh.
// codex is the sole owner; qsm-ccr reads, and at activation removes what CCR wrote into config.toml.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { TOML } from "bun";
import { binPath, isRecord } from "../../../lib/outcome.ts";
import type { Env } from "../../../lib/paths.ts";
import type { CodexTokens } from "./ccr-config.ts";
import { type Json, parseJson, parseOrName } from "./parse.ts";
import { notOnPath } from "./places.ts";
import type { Gateway } from "./route.ts";
import { atRouter } from "./settings.ts";

export function authPath(codexHome: string): string {
  return join(codexHome, "auth.json");
}

/** null when there is no login; throws naming the file when it does not parse. */
export function readCodexTokens(codexHome: string): CodexTokens | null {
  const path = authPath(codexHome);
  if (!existsSync(path)) {
    return null;
  }
  const raw = parseOrName(path, "JSON", () => parseJson(readFileSync(path, "utf8")));
  const t = isRecord(raw) && isRecord(raw.tokens) ? raw.tokens : {};
  if (typeof t.access_token !== "string" || typeof t.refresh_token !== "string") {
    return null;
  }
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    ...(typeof t.account_id === "string" ? { accountId: t.account_id } : {}),
  };
}

/** The access token's JWT `exp`, in ms; the token itself never leaves this function. */
export function tokenExpiry(jwt: string): number | undefined {
  const [, payload] = jwt.split(".");
  if (payload === undefined) {
    return undefined;
  }
  try {
    const claims = parseJson(Buffer.from(payload, "base64url").toString("utf8"));
    const exp = isRecord(claims) ? claims.exp : undefined;
    return typeof exp === "number" ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export function configTomlPath(codexHome: string): string {
  return join(codexHome, "config.toml");
}

export function catalogOverride(toml: string): string | undefined {
  const value = tomlTable(toml).model_catalog_json;
  return typeof value === "string" ? value : undefined;
}

/** The `model_catalog_json` of codex's config.toml; throws naming the file when it does not parse. */
export function catalogOverrideIn(codexHome: string): string | undefined {
  const path = configTomlPath(codexHome);
  return existsSync(path)
    ? parseOrName(path, "TOML", () => catalogOverride(readFileSync(path, "utf8")))
    : undefined;
}

const CCR_CATALOG = "ccr-model-catalog";
/** A name that says CCR: `ccr` as a whole word, or `claude-code-router` anywhere. */
function namesCcr(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("claude-code-router") || lower.split(/[^a-z]+/).includes("ccr");
}
const PROVIDER_KEYS = ["base_url", "experimental_bearer_token", "wire_api"];

type Toml = Json;

function pointsAtRouter(value: unknown, gateway: Gateway | undefined): boolean {
  return typeof value === "string" && gateway !== undefined && atRouter(value, gateway.address);
}

/** The `[model_providers.<id>]` ids CCR wrote: named for CCR, or with a base_url at the router. */
function ccrProviderIds(parsed: Toml, gateway: Gateway | undefined): Set<string> {
  const tables = isRecord(parsed.model_providers) ? parsed.model_providers : {};
  const ids = Object.entries(tables)
    .filter(([id, t]) => namesCcr(id) || (isRecord(t) && pointsAtRouter(t.base_url, gateway)))
    .map(([id]) => id);
  return new Set(ids);
}

/** The top-level keys CCR wrote: its provider choice, its catalog, and a provider's own fields
 * written outside any table. */
function ccrTopKeys(
  parsed: Toml,
  ids: ReadonlySet<string>,
  gateway: Gateway | undefined,
): string[] {
  const provider = parsed.model_provider;
  const usesCcr = typeof provider === "string" && (ids.has(provider) || namesCcr(provider));
  const keys: string[] = usesCcr ? ["model_provider"] : [];
  const catalog = parsed.model_catalog_json;
  if (typeof catalog === "string" && catalog.includes(CCR_CATALOG)) {
    keys.push("model_catalog_json");
  }
  const ours = usesCcr || pointsAtRouter(parsed.base_url, gateway);
  return ours ? [...keys, ...PROVIDER_KEYS.filter((k) => k in parsed)] : keys;
}

/** The provider id of a `[model_providers.<id>...]` header line, else undefined. */
function providerIdOfHeader(line: string): string | undefined {
  const header = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/.exec(line)?.[1];
  return header?.replaceAll(/["']/g, "").match(/^model_providers\.([^.]+)/)?.[1];
}

const isHeader = (line: string) => /^\s*\[/.test(line);

interface CcrRemoval {
  readonly text: string;
  /** each removed top-level key, and each removed table as `[model_providers.<id>]` */
  readonly removed: readonly string[];
}

/** The lines without the top-level `topKeys` and without the `[model_providers.<id>]` tables of
 * `ids`; the tables dropped are named in `tables`. */
/** What dropCcrLines carries through the file: the lines kept so far, the tables dropped, whether
 * the cursor is still above the first header, inside a dropped table, and the blank lines held
 * back from a dropped table's end. */
interface Dropping {
  readonly kept: string[];
  readonly tables: string[];
  top: boolean;
  dropping: boolean;
  held: string[];
}

/** A table header: enters or leaves a dropped table, and lets the blank lines held back after
 * a dropped table through when the kept text does not end in one already. */
function enterTable(line: string, ids: ReadonlySet<string>, d: Dropping): void {
  d.top = false;
  const id = providerIdOfHeader(line);
  d.dropping = id !== undefined && ids.has(id);
  const table = `[model_providers.${id}]`;
  if (d.dropping && !d.tables.includes(table)) {
    d.tables.push(table);
  }
  if ((d.kept.at(-1) ?? "").trim() !== "") {
    d.kept.push(...d.held);
  }
  d.held = [];
}

/** Whether `line` sets one of the top-level keys CCR wrote. */
function setsTopKey(line: string, topKeys: readonly string[]): boolean {
  return topKeys.includes(/^\s*([\w.-]+)\s*=/.exec(line)?.[1] ?? "");
}

function dropCcrLines(
  toml: string,
  topKeys: readonly string[],
  ids: ReadonlySet<string>,
): { readonly lines: string[]; readonly tables: string[] } {
  const d: Dropping = { kept: [], tables: [], top: true, dropping: false, held: [] };
  for (const line of toml.split("\n")) {
    if (isHeader(line)) {
      enterTable(line, ids, d);
    }
    if (d.dropping) {
      // blank lines that end a dropped table keep the spacing before the next one, unless a blank
      // line already holds it
      d.held = line.trim() === "" ? [...d.held, line] : [];
    } else if (!d.top || !setsTopKey(line, topKeys)) {
      d.kept.push(line);
    }
  }
  if (d.dropping && toml.endsWith("\n") && d.kept.at(-1) !== "") {
    d.kept.push("");
  }
  return { lines: d.kept, tables: d.tables };
}

/** A TOML document is a table at its top: the parsed value, narrowed. */
function tomlTable(text: string): Toml {
  const parsed: unknown = TOML.parse(text);
  if (!isRecord(parsed)) {
    throw new Error("TOML document is not a table");
  }
  return parsed;
}

/** What the line edit cannot do exactly: a quoted key, or a value over several lines. */
export class RemovalRefused extends Error {}

function parsedOrUndefined(text: string): Toml | undefined {
  try {
    return tomlTable(text);
  } catch {
    return undefined;
  }
}

const without = (table: Toml, keys: Iterable<string>): Toml => {
  const drop = new Set(keys);
  return Object.fromEntries(Object.entries(table).filter(([key]) => !drop.has(key)));
};

/** `before` as parsed, less the top-level `topKeys` and the `[model_providers.<id>]` tables of `ids`. */
function expectedAfter(before: Toml, topKeys: readonly string[], ids: ReadonlySet<string>): Toml {
  const top = without(before, topKeys);
  if (!isRecord(top.model_providers) || ids.size === 0) {
    return top;
  }
  const tables = without(top.model_providers, ids);
  return Object.keys(tables).length === 0
    ? without(top, ["model_providers"])
    : { ...top, model_providers: tables };
}

/** Throws RemovalRefused unless `text` parses to exactly what the original did, less the keys and
 * tables removed: nothing of the person's changed, nothing of CCR's stayed. */
function assertRemoved(
  before: Toml,
  text: string,
  topKeys: readonly string[],
  ids: ReadonlySet<string>,
): void {
  const left = parsedOrUndefined(text);
  if (left === undefined) {
    throw new RemovalRefused("the edit would leave text that does not parse");
  }
  if (!isDeepStrictEqual(left, expectedAfter(before, topKeys, ids))) {
    throw new RemovalRefused("the edit would change more or less than CCR's keys");
  }
}

/** config.toml without what CCR wrote into it: `model_provider` naming CCR, CCR's
 * `model_catalog_json`, CCR's `base_url`, `experimental_bearer_token` and `wire_api`, and its
 * `[model_providers.<id>]` tables. Every other line stays as the person wrote it; null when CCR
 * wrote nothing. Throws when the text does not parse, and RemovalRefused when the edited text
 * would not parse to the original less exactly what was removed. */
export function withoutCcrKeys(toml: string, gateway?: Gateway): CcrRemoval | null {
  const parsed = tomlTable(toml);
  const ids = ccrProviderIds(parsed, gateway);
  const topKeys = ccrTopKeys(parsed, ids, gateway);
  const { lines, tables } = dropCcrLines(toml, topKeys, ids);
  const removed = [...topKeys, ...tables];
  if (removed.length === 0) {
    return null;
  }
  const text = lines.join("\n");
  assertRemoved(parsed, text, topKeys, ids);
  return { text, removed };
}

/** The longest `codex debug models` may take before it is killed. */
export const CODEX_TIMEOUT_MS = 120_000;

/** codex's own catalog refresh (never --bundled); null when it ran clean, else the reason. */
export function refreshCatalog(env: Env): string | null {
  const codex = binPath("codex", env);
  if (codex === null) {
    return notOnPath("codex");
  }
  const r = spawnSync(codex, ["debug", "models"], {
    env: { ...env },
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
    timeout: CODEX_TIMEOUT_MS,
  });
  if (r.error !== undefined) {
    return `codex debug models did not run: ${r.error.message}`;
  }
  const tail = r.stderr.trim().split("\n").at(-1) ?? "";
  return r.status === 0 ? null : `codex debug models exited ${r.status}: ${tail}`;
}
