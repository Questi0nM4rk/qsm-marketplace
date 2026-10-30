#!/usr/bin/env bun
// The one place qsm-ccr changes files the person owns: CCR config (profile guard), codex's
// config.toml (what CCR wrote into it), user settings (the teammate command), and its own state
// (the custom router, the first sync). Each step names what it would change; none removes a router
// value from user settings, and none creates the codex-api provider: that is CCR's own import.
import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { resultOf } from "../../../lib/install-base.ts";
import {
  type Activation,
  type ActivationContext,
  activationMain,
  type InstallResult,
  type Step,
} from "../../../lib/install-contract.ts";
import { binPath, fail, type Outcome, ok } from "../../../lib/outcome.ts";
import { type Env, withHomeAt } from "../../../lib/paths.ts";
import { writeFileAtomic } from "../lib/atomic.ts";
import {
  addressOf,
  gatewayIn,
  gatewayOf,
  globalProfiles,
  guardHolds,
  hasProvider,
  readCcrConfig,
  withGuard,
  writeCcrConfig,
} from "../lib/ccr-config.ts";
import { configTomlPath, RemovalRefused, withoutCcrKeys } from "../lib/codex.ts";
import {
  CUSTOM_ROUTER,
  customRouterPath,
  isRunning,
  startDaemon,
  takeDown,
  waitFor,
  waitsOf,
} from "../lib/daemon.ts";
import type { Json } from "../lib/parse.ts";
import { type Places, placesOf } from "../lib/places.ts";
import { CODEX_PROVIDER, withoutRouterEnv } from "../lib/route.ts";
import {
  readUserSettings,
  TEAMMATE_COMMAND,
  teammateCommandOf,
  withTeammateCommand,
} from "../lib/settings.ts";
import { carriesOn, lockedSync, syncIsFresh } from "../lib/sync.ts";

type StepResult = Pick<Step, "status" | "detail">;

interface ActivationStep {
  readonly name: string;
  readonly holds: (places: Places, env: Env) => boolean;
  readonly run: (places: Places, ctx: ActivationContext) => StepResult | Promise<StepResult>;
}

const ACTIVATE_AGAIN = "then run qsm-setup activate qsm-ccr again";

/** CCR config where none exists: CCR creates it in a daemon whose HOME is a throwaway directory,
 * that daemon stops, the guard is set, and the file moves into CCR's real home. Leftovers of a
 * run that crashed are removed first. */
async function bootstrapCcrConfig(places: Places, env: Env): Promise<Outcome> {
  mkdirSync(places.stateDir, { recursive: true, mode: 0o700 });
  for (const old of readdirSync(places.stateDir).filter((f) => f.startsWith("bootstrap-"))) {
    rmSync(join(places.stateDir, old), { recursive: true, force: true });
  }
  const tmp = join(places.stateDir, `bootstrap-${randomUUID()}`);
  mkdirSync(tmp, { mode: 0o700 });
  const outFile = join(places.stateDir, "bootstrap.out");
  try {
    const throwaway = withHomeAt(withoutRouterEnv(env), tmp);
    delete throwaway.CCR_INTERNAL_HOME_DIR;
    delete throwaway.CODEX_HOME;
    const ccrHome = join(tmp, ".claude-code-router");
    const db = join(ccrHome, "config.sqlite");
    const started = startDaemon(throwaway, ccrHome, {
      file: outFile,
      append: false,
    });
    if (started.data === undefined) {
      return started;
    }
    const { start } = waitsOf(env);
    let fresh = null as Json | null;
    await waitFor(() => {
      fresh = readCcrConfig(db);
      return fresh !== null;
    }, start);
    const address = fresh === null ? undefined : addressOf(fresh.HOST, Number(fresh.PORT));
    if (address !== undefined) {
      // a daemon that has not opened its port has no pid to stop yet
      await waitFor(() => isRunning(address), start);
    }
    if (!(await takeDown(address === undefined ? started.data : { ...started.data, address }))) {
      return fail(
        "failed",
        `the throwaway CCR daemon still runs at ${address ?? "its port"}; stop it by hand, then activate again`,
      );
    }
    if (fresh === null) {
      return fail(
        "failed",
        `ccr start in a throwaway HOME created no config within ${start / 1000} s; see ${outFile}`,
      );
    }
    writeCcrConfig(db, fresh, withGuard(fresh));
    const checkpoint = new Database(db);
    checkpoint.run("PRAGMA wal_checkpoint(TRUNCATE)");
    checkpoint.close();
    if (existsSync(places.ccrDb)) {
      return fail("failed", `${places.ccrDb} appeared during the bootstrap; activate again`);
    }
    mkdirSync(places.ccrHome, { recursive: true, mode: 0o700 });
    // it will hold the gateway key and, after a sync, codex's tokens: 0600, whole or not at all
    writeFileAtomic(places.ccrDb, readFileSync(db), 0o600);
    return ok(
      undefined,
      `CCR created its config in a throwaway HOME; guarded and moved to ${places.ccrDb}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** No CCR config yet: CCR creates one in a throwaway HOME, and it arrives guarded. */
async function createGuarded(p: Places, ctx: ActivationContext): Promise<StepResult> {
  if (ctx.dryRun) {
    return {
      status: "skipped",
      detail: `would let CCR create ${p.ccrDb} in a throwaway HOME and set every profile to scope ccr, disabled`,
    };
  }
  const made = await bootstrapCcrConfig(p, ctx.env);
  return made.code === "ok"
    ? { status: "installed", detail: made.message ?? "" }
    : { status: "error", detail: made.message ?? "" };
}

/** A CCR config exists: its global profiles become scope ccr, disabled, while the router is down. */
async function guardExisting(p: Places, ctx: ActivationContext, c: Json): Promise<StepResult> {
  if (guardHolds(c)) {
    return {
      status: "already",
      detail: `every CCR profile is scope ccr, disabled, in ${p.ccrDb}`,
    };
  }
  const ids = globalProfiles(c);
  const gateway = gatewayOf(c);
  if (gateway !== undefined && (await isRunning(gateway.address))) {
    return {
      status: "error",
      detail: `the router runs at ${gateway.address}; stop it (ccr stop), ${ACTIVATE_AGAIN}`,
    };
  }
  if (ctx.dryRun) {
    return {
      status: "skipped",
      detail: `would set profile ${ids.join(", ")} to scope ccr, disabled, in ${p.ccrDb}`,
    };
  }
  writeCcrConfig(p.ccrDb, c, withGuard(c));
  return {
    status: "installed",
    detail: `set profile ${ids.join(", ")} to scope ccr, disabled, in ${p.ccrDb}`,
  };
}

const guard: ActivationStep = {
  name: "ccr profile guard",
  holds: (p) => {
    const c = readCcrConfig(p.ccrDb);
    return c !== null && guardHolds(c);
  },
  run: async (p, ctx) => {
    const c = readCcrConfig(p.ccrDb);
    return c === null ? createGuarded(p, ctx) : guardExisting(p, ctx, c);
  },
};

const provider: ActivationStep = {
  name: "codex-api provider",
  holds: (p) => {
    const c = readCcrConfig(p.ccrDb);
    return c !== null && hasProvider(c, CODEX_PROVIDER);
  },
  run: (p, ctx) =>
    provider.holds(p, ctx.env)
      ? {
          status: "already",
          detail: `${CODEX_PROVIDER} and its Codex OAuth plugin are in ${p.ccrDb}`,
        }
      : {
          status: "missing-prereq",
          detail: `CCR config has no ${CODEX_PROVIDER} provider with its Codex OAuth plugin; import Codex in CCR's own UI under that name, ${ACTIVATE_AGAIN}`,
        },
};

const router: ActivationStep = {
  name: "custom router",
  holds: (p) =>
    existsSync(customRouterPath(p.stateDir)) &&
    readFileSync(customRouterPath(p.stateDir), "utf8") === CUSTOM_ROUTER,
  run: (p, ctx) => {
    const path = customRouterPath(p.stateDir);
    if (router.holds(p, ctx.env)) {
      return { status: "already", detail: `${path} unchanged` };
    }
    if (ctx.dryRun) {
      return { status: "skipped", detail: `would write ${path}` };
    }
    mkdirSync(p.stateDir, { recursive: true, mode: 0o700 });
    writeFileSync(path, CUSTOM_ROUTER);
    return { status: "installed", detail: `wrote ${path}` };
  },
};

/** What CCR wrote into codex's config.toml; null when nothing, throws when it does not parse. */
function ccrKeysIn(p: Places) {
  const path = configTomlPath(p.codexHome);
  if (!existsSync(path)) {
    return null;
  }
  return withoutCcrKeys(readFileSync(path, "utf8"), gatewayIn(p.ccrDb));
}

/** The detail's tail naming each temp file of a killed write that a write swept away. */
const leftoversNote = (swept: readonly string[]): string =>
  swept.map((path) => `; removed the leftover ${path}`).join("");

const codexNative: ActivationStep = {
  name: "codex native config",
  holds: (p) => ccrKeysIn(p) === null,
  run: (p, ctx) => {
    const path = configTomlPath(p.codexHome);
    let found: ReturnType<typeof ccrKeysIn>;
    try {
      found = ccrKeysIn(p);
    } catch (e) {
      return {
        status: "error",
        detail:
          e instanceof RemovalRefused
            ? `${path}: ${e.message}; remove CCR's lines by hand (a quoted key or a multi-line value); it was left as it was`
            : `${path} does not parse as TOML; it was left as it was`,
      };
    }
    if (found === null) {
      return { status: "already", detail: `${path} holds nothing CCR wrote` };
    }
    const removed = found.removed.join(", ");
    // made before the first edit; a later edit never replaces it
    const backup = `${path}.qsm-ccr.bak`;
    if (ctx.dryRun) {
      return {
        status: "skipped",
        detail: `would remove ${removed} from ${path}, after a backup at ${backup}`,
      };
    }
    const swept = [
      ...(existsSync(backup)
        ? []
        : writeFileAtomic(backup, readFileSync(path), statSync(path).mode & 0o777)),
      ...writeFileAtomic(path, found.text),
    ];
    return {
      status: "installed",
      detail: `removed ${removed} from ${path}; every other line kept; the original is at ${backup}${leftoversNote(swept)}`,
    };
  },
};

const teammate: ActivationStep = {
  name: "teammate command",
  holds: (p, env) => {
    const read = readUserSettings(p.userSettings);
    const binary = binPath("qsm-ccr", env);
    return (
      read.data !== undefined && binary !== null && teammateCommandOf(read.data.json) === binary
    );
  },
  run: (p, ctx) => {
    const binary = binPath("qsm-ccr", ctx.env);
    if (binary === null) {
      return {
        status: "error",
        detail:
          "qsm-ccr is not on PATH; install the plugin first (bun plugins/qsm-ccr/scripts/install.ts)",
      };
    }
    const read = readUserSettings(p.userSettings);
    if (read.data === undefined) {
      return { status: "error", detail: read.message ?? p.userSettings };
    }
    const next = withTeammateCommand(read.data, binary);
    if (next === null) {
      return {
        status: "already",
        detail: `${TEAMMATE_COMMAND} is ${binary} in ${p.userSettings}`,
      };
    }
    if (ctx.dryRun) {
      return {
        status: "skipped",
        detail: `would write ${TEAMMATE_COMMAND}=${binary} into env of ${p.userSettings}`,
      };
    }
    mkdirSync(dirname(p.userSettings), { recursive: true });
    const swept = writeFileAtomic(p.userSettings, next);
    return {
      status: "installed",
      detail: `wrote ${TEAMMATE_COMMAND}=${binary} into env of ${p.userSettings}${leftoversNote(swept)}`,
    };
  },
};

const firstSync: ActivationStep = {
  name: "first sync",
  holds: (p) => syncIsFresh(p.stateDir, Date.now()),
  run: async (p, ctx) => {
    if (firstSync.holds(p, ctx.env)) {
      return {
        status: "already",
        detail: "the last good sync is under 24 hours old",
      };
    }
    if (ctx.dryRun) {
      return { status: "skipped", detail: "would run qsm-ccr sync" };
    }
    const synced = await lockedSync(p, ctx.env);
    return carriesOn(synced)
      ? { status: "installed", detail: synced.message ?? "synced" }
      : { status: "error", detail: `${synced.code}: ${synced.message ?? ""}` };
  },
};

/** A step that throws (CCR's config does not parse, its database stays busy) is an error step
 * naming the file, never the parser's message, so the rest of activation still answers. */
function unreadable(p: Places, name: string): Pick<Step, "status" | "detail"> {
  return {
    status: "error",
    detail: `${name}: ${p.ccrDb} could not be read or updated (it does not parse, or stays busy); fix it, ${ACTIVATE_AGAIN}`,
  };
}

async function runStep(
  s: ActivationStep,
  places: Places,
  ctx: ActivationContext,
): Promise<Pick<Step, "status" | "detail">> {
  try {
    return await s.run(places, ctx);
  } catch {
    return unreadable(places, s.name);
  }
}

function holdsStep(s: ActivationStep, places: Places, env: Env): boolean {
  try {
    return s.holds(places, env);
  } catch {
    return false;
  }
}

const STEPS: readonly ActivationStep[] = [
  guard,
  provider,
  router,
  codexNative,
  teammate,
  firstSync,
];

export const activation: Activation = {
  options: [],
  status: (env) => {
    const places = placesOf(env);
    const holds = STEPS.map((s) => holdsStep(s, places, env));
    if (holds.every(Boolean)) {
      return "activated";
    }
    return holds.some(Boolean) ? "differs" : "absent";
  },
  activate: async (ctx): Promise<InstallResult> => {
    const places = placesOf(ctx.env);
    const steps: Step[] = [];
    for (const s of STEPS) {
      const unfinished = steps.find(
        (st) => st.status === "error" || st.status === "missing-prereq",
      );
      // a sync with the guard or the provider missing would stop a router it cannot restart
      steps.push(
        s === firstSync && unfinished !== undefined
          ? {
              name: s.name,
              status: "skipped",
              detail: `not run: ${unfinished.name} did not complete`,
            }
          : { name: s.name, ...(await runStep(s, places, ctx)) },
      );
    }
    return resultOf("qsm-ccr", steps);
  },
};

if (import.meta.main) {
  process.exit(await activationMain(activation));
}
