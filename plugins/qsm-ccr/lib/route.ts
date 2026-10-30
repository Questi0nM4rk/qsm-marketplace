// Which model a launch runs on, and the environment and arguments that carry it. Pure: no file,
// no process. Adding a provider is one more PROVIDERS row and one more allowlist source in sync.
import { fail, type Outcome } from "../../../lib/outcome.ts";
import type { Env } from "../../../lib/paths.ts";
import { type CatalogModel, defaultModel } from "./catalog.ts";

interface ProviderRow {
  readonly prefix: string;
  readonly provider: string;
}

/** The provider codex's login serves: sync copies codex's tokens and catalog into it. */
export const CODEX_PROVIDER = "codex-api";

/** The registered teammate-name prefixes: a name `<prefix>...` runs on `<provider>`. */
export const PROVIDERS: readonly [ProviderRow, ...ProviderRow[]] = [
  { prefix: "gpt-", provider: CODEX_PROVIDER },
];

interface ProviderModels {
  readonly allowlist: readonly string[];
  readonly catalog: readonly CatalogModel[];
}
export type ModelsOf = (provider: string) => ProviderModels;

interface ClaudeRoute {
  readonly kind: "claude";
}
export interface RoutedRoute {
  readonly kind: "routed";
  readonly provider: string;
  readonly slug: string;
  readonly contextWindow?: number;
}
type Route = ClaudeRoute | RoutedRoute;
interface Refused {
  readonly kind: "refused";
  readonly outcome: Outcome;
}

export const CLAUDE: ClaudeRoute = { kind: "claude" };

/** Every variable that points a claude process at the router. */
export const ROUTER_ENV: readonly string[] = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
  "CLAUDE_CODE_SUBAGENT_MODEL",
  "ANTHROPIC_SMALL_FAST_MODEL",
];

export interface Gateway {
  /** http://<host>:<port> */
  readonly address: string;
  /** the key CCR stores for local clients; never written to disk by qsm-ccr, never printed */
  readonly key: string;
}

export type RoutedLaunch = RoutedRoute & { readonly gateway: Gateway };
export type Launch = ClaudeRoute | RoutedLaunch;

function refused(message: string): Refused {
  return { kind: "refused", outcome: fail("missing", message) };
}

/** A Claude model or alias: never routed, whatever an allowlist says. */
const CLAUDE_MODEL = /^(claude|opus|sonnet|haiku|fable)\b/i;

function routed(provider: string, slug: string, models: ProviderModels): RoutedRoute | Refused {
  if (CLAUDE_MODEL.test(slug)) {
    return refused(`${slug} is a Claude model; it is never routed through CCR`);
  }
  const contextWindow = models.catalog.find((m) => m.slug === slug)?.contextWindow;
  return {
    kind: "routed",
    provider,
    slug,
    ...(contextWindow === undefined ? {} : { contextWindow }),
  };
}

function providerDefault(row: ProviderRow, models: ProviderModels): RoutedRoute | Refused {
  const model = defaultModel(models.catalog);
  if (model === undefined) {
    return refused(`the ${row.provider} catalog lists no model; run qsm-ccr sync`);
  }
  if (!models.allowlist.includes(model.slug)) {
    return refused(
      `${model.slug}, the ${row.provider} default, is not in its allowlist; run qsm-ccr sync`,
    );
  }
  return routed(row.provider, model.slug, models);
}

export function providerOf(name: string): ProviderRow | undefined {
  return PROVIDERS.find((p) => name.startsWith(p.prefix));
}

/** The longest allowlist slug the name equals, or begins with followed by `-`. */
export function slugInName(name: string, allowlist: readonly string[]): string | undefined {
  return allowlist
    .filter((s) => name === s || name.startsWith(`${s}-`))
    .toSorted((a, b) => b.length - a.length)[0];
}

/** A teammate's route by its name: plain Claude without a registered prefix, else its provider's
 * model, the models loaded only then; a refusal names the provider it would have run on. */
export function resolveTeammate(
  name: string,
  loadModels: () => Outcome<ModelsOf>,
): Route | (Refused & { readonly provider: string }) {
  const row = providerOf(name);
  if (row === undefined) {
    return CLAUDE;
  }
  const loaded = loadModels();
  if (loaded.data === undefined) {
    return { kind: "refused", outcome: loaded, provider: row.provider };
  }
  const models = loaded.data(row.provider);
  const slug = slugInName(name, models.allowlist);
  const route =
    slug === undefined ? providerDefault(row, models) : routed(row.provider, slug, models);
  return route.kind === "refused" ? { ...route, provider: row.provider } : route;
}

/** `slug` from some provider's allowlist, or the first provider's default. A Claude model is in
 * no allowlist, so it is refused like any unknown slug. */
export function resolveLead(slug: string | undefined, modelsOf: ModelsOf): RoutedRoute | Refused {
  const [first] = PROVIDERS;
  if (slug === undefined) {
    return providerDefault(first, modelsOf(first.provider));
  }
  for (const row of PROVIDERS) {
    const models = modelsOf(row.provider);
    if (models.allowlist.includes(slug)) {
      return routed(row.provider, slug, models);
    }
  }
  const lists = PROVIDERS.map(
    (r) => `${r.provider}: ${modelsOf(r.provider).allowlist.join(", ") || "(empty)"}`,
  );
  return refused(`${slug} is absent from every allowlist (${lists.join("; ")})`);
}

/** `parent` without any router variable: what every process qsm-ccr starts begins from. */
export function withoutRouterEnv(parent: Env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(parent)) {
    if (value !== undefined && !ROUTER_ENV.includes(key)) {
      env[key] = value;
    }
  }
  return env;
}

/** The one environment builder for every launch, lead or teammate. */
export function launchEnv(parent: Env, launch: Launch): Record<string, string> {
  const env = withoutRouterEnv(parent);
  if (launch.kind === "claude") {
    return env;
  }
  const model = `${launch.provider},${launch.slug}`;
  env.ANTHROPIC_BASE_URL = launch.gateway.address;
  env.ANTHROPIC_API_KEY = launch.gateway.key;
  env.ANTHROPIC_MODEL = model;
  env.ANTHROPIC_DEFAULT_OPUS_MODEL = model;
  env.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
  env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;
  if (launch.contextWindow !== undefined) {
    env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = String(launch.contextWindow);
  }
  return env;
}

/** A routed launch drops `--model <alias>`: the Agent tool's model is a Claude alias. */
export function launchArgs(argv: readonly string[], launch: Launch): string[] {
  if (launch.kind === "claude") {
    return [...argv];
  }
  const out: string[] = [];
  let skipNext = false;
  for (const [i, arg] of argv.entries()) {
    if (skipNext) {
      skipNext = false;
    } else if (arg === "--model") {
      skipNext = argv[i + 1]?.startsWith("--") !== true;
    } else if (!arg.startsWith("--model=")) {
      out.push(arg);
    }
  }
  return out;
}
