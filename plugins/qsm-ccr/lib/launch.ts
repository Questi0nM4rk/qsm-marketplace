// Running claude for a teammate or a lead: the terminal's stdio, its signals, its exit code; and
// the launch log, one line per launch with no credential in it.
import { constants } from "node:os";
import { spawn } from "bun";
import { fail, type Outcome, ok, renderText } from "../../../lib/outcome.ts";
import type { Env } from "../../../lib/paths.ts";
import { readCatalog } from "./catalog.ts";
import { gatewayIn, modelsFrom, readCcrConfig } from "./ccr-config.ts";
import { daemonState, ensureRunning, LOCK_WAIT_MS, runningDaemon } from "./daemon.ts";
import { lockHeld, withLock } from "./lock.ts";
import { appendStateLine, type Places } from "./places.ts";
import { retag } from "./retag.ts";
import type { Gateway, ModelsOf, RoutedLaunch, RoutedRoute } from "./route.ts";
import { carriesOn, syncAndReload } from "./sync.ts";

interface LaunchLine {
  readonly name: string;
  /** a provider, or `claude` */
  readonly provider: string;
  readonly model: string;
  /** `started`, or the refusal's outcome code and message */
  readonly outcome: string;
}

export function appendLaunchLog(stateDir: string, line: LaunchLine, at: number = Date.now()): void {
  const fields = [
    new Date(at).toISOString(),
    line.name,
    line.provider,
    line.model,
    line.outcome.split("\n")[0],
  ].map((f) => f?.replaceAll(/[\t\r\n]/g, " "));
  appendStateLine(stateDir, "launch.log", fields.join("\t"));
}

/** SIGINT and SIGQUIT come from the terminal to claude itself (same process group), so they are
 * absorbed, never sent twice; SIGTERM and SIGHUP (tmux closing the pane) are forwarded. */
const FORWARD: readonly NodeJS.Signals[] = ["SIGTERM", "SIGHUP"];
const ABSORB: readonly NodeJS.Signals[] = ["SIGINT", "SIGQUIT"];

export async function runClaude(
  claude: string,
  args: readonly string[],
  env: Record<string, string>,
): Promise<number> {
  const child = spawn([claude, ...args], {
    env,
    stdio: ["inherit", "inherit", "inherit"],
  });
  const handlers = [
    ...FORWARD.map(
      (sig) =>
        [
          sig,
          () => {
            child.kill(sig);
          },
        ] as const,
    ),
    ...ABSORB.map((sig) => [sig, () => {}] as const),
  ];
  for (const [sig, handler] of handlers) {
    process.on(sig, handler);
  }
  try {
    const code = await child.exited;
    const signal = child.signalCode;
    if (signal === null) {
      return code;
    }
    return 128 + (typeof signal === "number" ? signal : constants.signals[signal]);
  } finally {
    for (const [sig, handler] of handlers) {
      process.off(sig, handler);
    }
  }
}

export function loadModels(places: Places): Outcome<ModelsOf> {
  const config = readCcrConfig(places.ccrDb);
  if (config === null) {
    return fail("missing", `no CCR config at ${places.ccrDb}; run qsm-setup activate qsm-ccr`);
  }
  const catalog = readCatalog(places.codexHome);
  if (catalog === null) {
    return fail("missing", `no codex catalog in ${places.codexHome}; run qsm-ccr sync`);
  }
  if (!catalog.readable) {
    return fail("failed", `${catalog.path} does not parse; run qsm-ccr sync`);
  }
  return ok(modelsFrom(config, catalog.models));
}

/** The one door to a running daemon, shared by lead and the teammate launcher. CCR's daemon that
 * already runs is used without the lock while no one holds it (a start holds it until its proof);
 * else, under the lock, a port another process holds is refused before any sync, a daemon that is
 * down is synced for first, and a sync that does not carry on stops the start with its outcome. */
async function ensureDaemon(places: Places, env: Env): Promise<Outcome<Gateway>> {
  const running = lockHeld(places.stateDir) ? undefined : await runningDaemon(places);
  if (running !== undefined) {
    return running;
  }
  return withLock(
    places.stateDir,
    async () => {
      const gateway = gatewayIn(places.ccrDb);
      if (
        gateway === undefined ||
        (await daemonState(places.ccrHome, gateway.address)) === "down"
      ) {
        const synced = await syncAndReload(places, env);
        if (!carriesOn(synced)) {
          return retag(synced);
        }
        if (synced.code === "worse") {
          process.stderr.write(renderText(synced).stderr);
        }
      }
      return ensureRunning(places, env, false);
    },
    LOCK_WAIT_MS,
  );
}

/** The route with the gateway of a running router, or the refusal of ensure. */
export async function prepareRouted(
  route: RoutedRoute,
  places: Places,
  env: Env,
): Promise<Outcome<RoutedLaunch>> {
  const ensured = await ensureDaemon(places, env);
  return ensured.data === undefined ? retag(ensured) : ok({ ...route, gateway: ensured.data });
}
