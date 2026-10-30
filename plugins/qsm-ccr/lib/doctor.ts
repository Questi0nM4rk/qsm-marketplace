// qsm-ccr doctor: every check runs, none starts or writes anything, none prints a credential.
import { accessSync, constants } from "node:fs";
import { basename } from "node:path";
import {
  checkTools,
  fail,
  messageOf,
  type Outcome,
  type OutcomeCode,
  ok,
  onPath,
} from "../../../lib/outcome.ts";
import type { Env } from "../../../lib/paths.ts";
import { readCatalog } from "./catalog.ts";
import { claudeTraffic, gatewayOf, modelsFrom, oauthCopies, readCcrConfig } from "./ccr-config.ts";
import { authPath, catalogOverrideIn, configTomlPath, readCodexTokens } from "./codex.ts";
import { daemonState, foreign, guards } from "./daemon.ts";
import type { Json } from "./parse.ts";
import { type Places, placesOf, UPSTREAM } from "./places.ts";
import { CODEX_PROVIDER, type Gateway, PROVIDERS, resolveLead } from "./route.ts";
import {
  readUserSettings,
  routerModel,
  TEAMMATE_COMMAND,
  teammateCommandOf,
  type UserSettings,
} from "./settings.ts";
import { lastSyncLine } from "./sync.ts";

export interface Check {
  readonly name: string;
  readonly code: OutcomeCode;
  readonly detail: string;
}

type Row = Omit<Check, "name">;

/** One check, one try: a check that throws (a file that does not parse) is its own failed row,
 * and every other check still runs. */
async function one(name: string, run: () => Row | Promise<Row>): Promise<Check> {
  try {
    return { name, ...(await run()) };
  } catch (e) {
    return { name, code: "failed", detail: messageOf(e) };
  }
}

/** The problem, else ok with `okDetail`. */
function verdictRow(problem: Row | undefined, okDetail: string): Row {
  return problem ?? { code: "ok", detail: okDetail };
}

/** worst first */
const SEVERITY: readonly OutcomeCode[] = ["failed", "blocked", "missing", "worse", "ok"];

function toolChecks(env: Env): Promise<Check>[] {
  return checkTools(UPSTREAM, (cmd) => onPath(cmd, env)).map(({ cmd, present, hint }) =>
    one(`${cmd} on PATH`, () =>
      verdictRow(
        present ? undefined : { code: "missing", detail: `${cmd} is not on PATH: ${hint}` },
        `${cmd} found`,
      ),
    ),
  );
}

/** CCR config's own checks: its profiles, Claude traffic, the default model in the allowlist. */
function ccrChecks(places: Places, config: Json, broken: Broken): Promise<Check>[] {
  const catalog = readCatalog(places.codexHome);
  return [
    ...(catalog?.readable === false
      ? [
          one("codex catalog", () => ({
            code: "failed",
            detail: `${catalog.path} does not parse; run qsm-ccr sync`,
          })),
        ]
      : []),
    one("CCR profiles", () => verdictRow(broken("CCR profiles"), "none global")),
    one("Claude traffic in CCR", () => {
      const traffic = claudeTraffic(config);
      return verdictRow(
        traffic.length === 0 ? undefined : { code: "failed", detail: traffic.join("; ") },
        "none",
      );
    }),
    one("default model in allowlist", () => {
      const route = resolveLead(undefined, modelsFrom(config, catalog?.models ?? []));
      return route.kind === "refused"
        ? { code: route.outcome.code, detail: route.outcome.message ?? "" }
        : { code: "ok", detail: `${route.provider},${route.slug}` };
    }),
  ];
}

function tokenCopiesCheck(
  codexRefresh: string | undefined,
  copies: readonly (string | undefined)[],
): Row {
  if (codexRefresh === undefined || copies.length === 0) {
    return {
      code: "missing",
      detail: "nothing to compare: needs codex login and the codex-api provider in CCR",
    };
  }
  return verdictRow(
    copies.every((c) => c === codexRefresh)
      ? undefined
      : {
          code: "failed",
          detail: "CCR's refresh token differs from codex's; run codex login, then qsm-ccr sync",
        },
    "CCR holds codex's refresh token",
  );
}

function codexChecks(places: Places, config: Json | null): Promise<Check>[] {
  const auth = authPath(places.codexHome);
  const bad: ReadonlySet<OutcomeCode> = new Set(["failed", "blocked", "missing", "usage"]);
  return [
    one("codex config", () => {
      const override = catalogOverrideIn(places.codexHome);
      return verdictRow(
        override === undefined
          ? undefined
          : {
              code: "failed",
              detail: `${configTomlPath(places.codexHome)} names model_catalog_json (${override})`,
            },
        "no model_catalog_json",
      );
    }),
    one("codex login", () =>
      verdictRow(
        readCodexTokens(places.codexHome) === null
          ? { code: "missing", detail: `no tokens in ${auth}; run codex login` }
          : undefined,
        auth,
      ),
    ),
    one("token copies", () =>
      tokenCopiesCheck(
        readCodexTokens(places.codexHome)?.refreshToken,
        (config === null ? [] : oauthCopies(config, CODEX_PROVIDER)).map((c) => c.refreshToken),
      ),
    ),
    one("last sync", () => {
      const last = lastSyncLine(places.stateDir);
      return last === undefined
        ? { code: "missing", detail: "never synced; run qsm-ccr sync" }
        : {
            code: bad.has(last.code) ? "failed" : "ok",
            detail: `${new Date(last.at).toISOString()} ${last.code}: ${last.message}`,
          };
    }),
  ];
}

async function daemonRow(places: Places, gateway: Gateway | undefined): Promise<Row> {
  if (gateway === undefined) {
    return { code: "ok", detail: "not running (no CCR address yet)" };
  }
  const state = await daemonState(places.ccrHome, gateway.address);
  if (state === "foreign") {
    return foreign(places, gateway.address);
  }
  return {
    code: "ok",
    detail:
      state === "ccr" ? `running at ${gateway.address}` : "not running; ensure starts it on demand",
  };
}

function teammateCommandRow(s: Json): Row {
  const path = teammateCommandOf(s);
  const rerun = "run qsm-setup activate qsm-ccr";
  if (path === undefined) {
    return {
      code: "missing",
      detail: `user settings env has no ${TEAMMATE_COMMAND}; ${rerun}`,
    };
  }
  try {
    accessSync(path, constants.X_OK);
  } catch {
    return {
      code: "missing",
      detail: `${path} is not an executable; ${rerun}`,
    };
  }
  return verdictRow(
    basename(path) === "qsm-ccr"
      ? undefined
      : { code: "missing", detail: `${path} is not qsm-ccr; ${rerun}` },
    path,
  );
}

/** Every slug a settings `model` could be a router model by: the whole catalog and the allowlists. */
function routerSlugs(codexHome: string, config: Json | null): string[] {
  const catalog = readCatalog(codexHome)?.models ?? [];
  const allowed =
    config === null
      ? []
      : PROVIDERS.flatMap((p) => modelsFrom(config, catalog)(p.provider).allowlist);
  return [...catalog.map((m) => m.slug), ...allowed];
}

/** User settings' checks; one that does not parse is the one row that names it. */
function settingsChecks(
  places: Places,
  config: Json | null,
  settings: Outcome<UserSettings>,
  broken: Broken,
): Promise<Check>[] {
  const read = settings.data;
  if (read === undefined) {
    return [
      one("user settings", () => ({
        code: "failed",
        detail: settings.message ?? "",
      })),
    ];
  }
  const damage = broken("router values in user settings");
  return [
    // doctor reports damage as failed: the file is wrong; only a start refuses it
    one("router values in user settings", () =>
      verdictRow(damage === undefined ? undefined : { ...damage, code: "failed" }, "none"),
    ),
    one("user settings model", () => {
      const model = routerModel(read.json, routerSlugs(places.codexHome, config));
      return verdictRow(
        model === undefined
          ? undefined
          : {
              code: "failed",
              detail: `${places.userSettings} model is ${model}, a router model; set it back by hand`,
            },
        "not a router model",
      );
    }),
    one("teammate command", () => teammateCommandRow(read.json)),
  ];
}

/** The guard of `name` the machine breaks, as its row. */
type Broken = (name: string) => Row | undefined;

function verdict(checks: readonly Check[]): Outcome<{ readonly checks: readonly Check[] }> {
  const code = SEVERITY.find((s) => checks.some((c) => c.code === s)) ?? "ok";
  const rows = checks.map((c) => `  ${c.code.padEnd(7)}  ${c.name}: ${c.detail}`).join("\n");
  const data = { checks };
  return code === "ok"
    ? ok(data, `qsm-ccr: healthy\n${rows}`)
    : fail(code, `qsm-ccr: ${code}\n${rows}`, data);
}

export async function doctor(env: Env): Promise<Outcome<{ readonly checks: readonly Check[] }>> {
  const places = placesOf(env);
  const settings = readUserSettings(places.userSettings);
  // read once for every check that needs it: null when absent, or when it does not parse
  let config = null as Json | null;
  const configRow = await one("CCR config", () => {
    config = readCcrConfig(places.ccrDb);
    return verdictRow(
      guards(places, config, settings).find((v) => v.name === "CCR config"),
      places.ccrDb,
    );
  });
  const violations = guards(places, config, settings);
  const broken: Broken = (name) => violations.find((v) => v.name === name);
  const gateway = config === null ? undefined : gatewayOf(config);
  const tools = await Promise.all(toolChecks(env));
  const rest = await Promise.all([
    ...(config === null ? [] : ccrChecks(places, config, broken)),
    ...settingsChecks(places, config, settings, broken),
    ...codexChecks(places, config),
    one("daemon", () => daemonRow(places, gateway)),
  ]);
  return verdict([...tools, configRow, ...rest]);
}
