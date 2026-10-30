// The person's Claude user settings: read them, find router values in them, never fix them. The
// one write qsm-ccr makes here is activation's teammate command.
import { existsSync, readFileSync } from "node:fs";
import { fail, isRecord, messageOf, type Outcome, ok } from "../../../lib/outcome.ts";
import { type Json, parseOrName } from "./parse.ts";
import { type Gateway, PROVIDERS } from "./route.ts";

export interface UserSettings {
  readonly path: string;
  /** the file as it is; null when there is no file */
  readonly text: string | null;
  readonly json: Json;
}

export const TEAMMATE_COMMAND = "CLAUDE_CODE_TEAMMATE_COMMAND";

export function readUserSettings(path: string): Outcome<UserSettings> {
  if (!existsSync(path)) {
    return ok({ path, text: null, json: {} });
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    const why =
      e instanceof Error && "code" in e && typeof e.code === "string" ? e.code : "an error";
    return fail("failed", `${path} could not be read (${why}); it was left as it was`);
  }
  try {
    const json = parseOrName(path, "a JSON object", () => {
      const parsed: unknown = JSON.parse(text);
      if (!isRecord(parsed)) {
        throw new Error("not an object");
      }
      return parsed;
    });
    return ok({ path, text, json });
  } catch (e) {
    return fail("failed", `${messageOf(e)}; it was left as it was`);
  }
}

function envOf(s: Json): Json {
  return isRecord(s.env) ? s.env : {};
}

/** Every host a URL reaches the router on from this machine, 0.0.0.0 included. */
const ROUTER_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "0.0.0.0"]);

/** The keys whose presence in user settings is router-shaped whatever their value. */
const ROUTER_KEYS = new Set(["ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]);

/** A URL at the router's port on a loopback host or on the router's own host. */
export function atRouter(value: string, address: string): boolean {
  try {
    const url = new URL(value);
    const router = new URL(address);
    return (
      (ROUTER_HOSTS.has(url.hostname) || url.hostname === router.hostname) &&
      url.port === router.port
    );
  } catch {
    return false;
  }
}

function holdsGateway(value: string, gateway: Gateway): boolean {
  return atRouter(value, gateway.address) || (gateway.key !== "" && value.includes(gateway.key));
}

/** The router values user settings holds, as `env.<KEY>` and `apiKeyHelper`: the base url, api key
 * and auth token keys whatever they hold, any other env value pointing at the router or holding
 * its key (needs the CCR config), and an apiKeyHelper naming CCR. */
export function routerDamage(s: Json, gateway?: Gateway): string[] {
  const keys = Object.entries(envOf(s))
    .filter(
      ([k, v]) =>
        ROUTER_KEYS.has(k) ||
        (gateway !== undefined && typeof v === "string" && holdsGateway(v, gateway)),
    )
    .map(([k]) => `env.${k}`);
  const helper = s.apiKeyHelper;
  if (typeof helper === "string" && /(^|[^a-z])ccr([^a-z]|$)|claude-code-router/i.test(helper)) {
    keys.push("apiKeyHelper");
  }
  return keys;
}

export function routerModel(s: Json, catalogSlugs: readonly string[]): string | undefined {
  const { model } = s;
  if (typeof model !== "string") {
    return undefined;
  }
  const pair = PROVIDERS.some((p) => model.startsWith(`${p.provider},`));
  return pair || model.startsWith("anthropic/claude-ccr-") || catalogSlugs.includes(model)
    ? model
    : undefined;
}

/** The keys a CCR start may write, each as its JSON text: `env.<KEY>`, `apiKeyHelper`, `model`. */
export function guardedSnapshot(s: Json): Record<string, string> {
  const snap: Record<string, string> = {};
  for (const [k, v] of Object.entries(envOf(s))) {
    snap[`env.${k}`] = JSON.stringify(v);
  }
  for (const key of ["apiKeyHelper", "model"]) {
    if (key in s) {
      snap[key] = JSON.stringify(s[key]);
    }
  }
  return snap;
}

export function changedKeys(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => before[k] !== after[k]).toSorted((a, b) => a.localeCompare(b));
}

/** Per file, the keys a CCR start may write (or the whole text, for a file that does not parse). */
type SettingsSnapshot = ReadonlyMap<string, Readonly<Record<string, string>>>;

export function snapshotOf(paths: readonly string[]): SettingsSnapshot {
  return new Map(
    paths.map((path) => {
      const read = readUserSettings(path).data;
      return [
        path,
        read === undefined ? { "(text)": readFileSync(path, "utf8") } : guardedSnapshot(read.json),
      ];
    }),
  );
}

/** Each file whose guarded keys differ, as `<path>: <key>, <key>`. */
export function settingsChanges(before: SettingsSnapshot, after: SettingsSnapshot): string[] {
  return [...after].flatMap(([path, keys]) => {
    const changed = changedKeys(before.get(path) ?? {}, keys);
    return changed.length === 0 ? [] : [`${path}: ${changed.join(", ")}`];
  });
}

export function teammateCommandOf(s: Json): string | undefined {
  const value = envOf(s)[TEAMMATE_COMMAND];
  return typeof value === "string" ? value : undefined;
}

/** settings.json text with the teammate command in env, every other key kept; null when it is there. */
export function withTeammateCommand(s: UserSettings, binary: string): string | null {
  if (teammateCommandOf(s.json) === binary) {
    return null;
  }
  return `${JSON.stringify({ ...s.json, env: { ...envOf(s.json), [TEAMMATE_COMMAND]: binary } }, null, 2)}\n`;
}
