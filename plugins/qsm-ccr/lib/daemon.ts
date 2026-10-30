// The router daemon: started only through ensure, under the lock, after a sync, never while a
// profile is global or user settings hold router values, and proven harmless by comparing the
// guarded settings keys before and after. Running is a loopback TCP connect to HOST:PORT, and it is
// CCR's only while the service.json in CCR's home names a live pid whose service answers as CCR: any
// `ccr` invocation can start the daemon, so none is used to ask.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connect, sleep } from "bun";
import { isAlive, spawnDetached } from "../../../lib/detach.ts";
import {
  binPath,
  fail,
  isRecord,
  type Outcome,
  type OutcomeCode,
  ok,
} from "../../../lib/outcome.ts";
import type { Env } from "../../../lib/paths.ts";
import { claudeSettingsFiles, gatewayOf, globalProfiles, readCcrConfig } from "./ccr-config.ts";
import { CODEX_TIMEOUT_MS } from "./codex.ts";
import { type Json, parseJson } from "./parse.ts";
import type { Places } from "./places.ts";
import { retag } from "./retag.ts";
import { type Gateway, withoutRouterEnv } from "./route.ts";
import {
  readUserSettings,
  routerDamage,
  settingsChanges,
  snapshotOf,
  type UserSettings,
} from "./settings.ts";

/** How long a start may take to open the port. */
export const START_WAIT_MS = 20_000;
/** CCR applies its profiles just after its port opens: the settings are compared after this. */
const SETTLE_MS = 1000;
/** `ccr stop`'s own limit, the wait for the port to close, and the wait after SIGTERM. */
const STOP_RUN_MS = 20_000;
const STOP_WAIT_MS = 10_000;
export const STOP_MAX_MS = STOP_RUN_MS + 2 * STOP_WAIT_MS;
/** The longest one holder keeps the lock is codex's refresh, two starts (a reload's and ensure's)
 * and three stops (a reload's, and one after each start that changed settings); a waiter waits a
 * minute longer, so it never gives up on a holder still within its limits. */
export const LOCK_WAIT_MS =
  CODEX_TIMEOUT_MS + 2 * (START_WAIT_MS + SETTLE_MS) + 3 * STOP_MAX_MS + 60_000;
const POLL_MS = 200;
const CONNECT_MS = 1000;

interface Waits {
  readonly start: number;
  readonly settle: number;
  readonly stop: number;
}

/** The start, settle and stop waits; each `QSM_CCR_*` variable shortens one for a test. */
export function waitsOf(env: Env): Waits {
  const ms = (name: string, otherwise: number) => {
    const value = Number(env[name]);
    return Number.isInteger(value) && value > 0 ? value : otherwise;
  };
  return {
    start: ms("QSM_CCR_START_WAIT_MS", START_WAIT_MS),
    settle: ms("QSM_CCR_SETTLE_MS", SETTLE_MS),
    stop: ms("QSM_CCR_STOP_WAIT_MS", STOP_WAIT_MS),
  };
}

/** Deletes `metadata`, which the codex backend rejects and Claude Code always sends. */
export const CUSTOM_ROUTER = `// Written by qsm-ccr activation. Strips request fields the codex backend rejects
// (Claude Code always sends \`metadata\`); returns undefined so CCR's routing continues.
module.exports = async function router(ctx) {
  for (const body of [ctx?.body, ctx?.req?.body, ctx?.request?.body]) {
    if (body && typeof body === "object" && "metadata" in body) {
      delete body.metadata;
    }
  }
  return undefined;
};
`;

export function customRouterPath(stateDir: string): string {
  return join(stateDir, "custom-router.js");
}

/** How long an accepted connect must stay open to count: under WSL2 mirrored networking every
 * loopback port accepts a connect and resets it at once when nothing listens there. */
const HOLD_MS = 200;

/** A loopback connect a listener keeps open for HOLD_MS, answered within CONNECT_MS: a filtered
 * port must not hang a launch, and an accepted connect alone proves nothing. */
export function isRunning(address: string): Promise<boolean> {
  const url = new URL(address);
  return new Promise<boolean>((resolve) => {
    let done = false;
    let socket: { end(): void } | undefined;
    let hold: ReturnType<typeof setTimeout> | undefined;
    const settle = (running: boolean) => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(limit);
      clearTimeout(hold);
      socket?.end();
      resolve(running);
    };
    const limit = setTimeout(() => {
      settle(false);
    }, CONNECT_MS);
    connect({
      // an IPv6 host comes bracketed in a URL and bare to connect
      hostname: url.hostname.replace(/^\[(.*)\]$/, "$1"),
      port: Number(url.port),
      socket: {
        data: () => {},
        open: (s) => {
          socket = s;
          hold = setTimeout(() => {
            settle(true);
          }, HOLD_MS);
        },
        close: () => {
          settle(false);
        },
        error: () => {
          settle(false);
        },
        connectError: () => {
          settle(false);
        },
      },
    }).catch(() => {
      settle(false);
    });
  });
}

/** The identity probe's own limit: a daemon that does not answer in time is not proven. */
const IDENTITY_MS = 2000;
/** The hosts a management RPC is ever sent to: never one off this machine. */
const RPC_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** A call to CCR's management RPC at the url service.json names, the way CCR's own `ccr stop`
 * asks; undefined on any refusal, timeout or failure. */
async function serviceRpc(
  url: string,
  method: string,
  args: readonly unknown[],
): Promise<Json | undefined> {
  try {
    const target = new URL(url);
    if (!RPC_HOSTS.has(target.hostname)) {
      return undefined;
    }
    const response = await fetch(`${target.origin}/api/ccr/rpc`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ccr-web-auth": target.searchParams.get("ccr_web_token")?.trim() ?? "",
      },
      body: JSON.stringify({ args, method }),
      signal: AbortSignal.timeout(IDENTITY_MS),
    });
    const body: unknown = await response.json();
    return response.ok && isRecord(body) && body.ok === true && isRecord(body.value)
      ? body.value
      : undefined;
  } catch {
    return undefined;
  }
}

/** The pid of CCR's own daemon, proven the way CCR's `ccr stop` proves it before it signals: the
 * pid in service.json lives, and the service at the url there answers as CCR (with the file's
 * service token, as that same pid). A stale file whose pid some other process now holds proves
 * nothing and gives undefined. */
async function servicePid(ccrHome: string): Promise<number | undefined> {
  try {
    const file = serviceFile(ccrHome);
    if (file === undefined || !isAlive(file.pid)) {
      return undefined;
    }
    const answers = await answersAsCcr(file);
    return answers ? file.pid : undefined;
  } catch {
    return undefined;
  }
}

interface ServiceFile {
  readonly pid: number;
  readonly url: string;
  readonly token: string;
}

/** service.json's pid, url and token; undefined for no file, one that does not parse, or a field
 * of the wrong shape, because such a file proves nothing. */
function serviceFile(ccrHome: string): ServiceFile | undefined {
  const file = parseJson(readFileSync(join(ccrHome, "service.json"), "utf8"));
  if (!isRecord(file)) {
    return undefined;
  }
  const { pid, url } = file;
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0 || typeof url !== "string") {
    return undefined;
  }
  const token = typeof file.serviceToken === "string" ? file.serviceToken.trim() : "";
  return { pid, url, token };
}

/** The service at the file's url answers as CCR: with the file's token, as that same pid; without
 * one, by its app name. */
async function answersAsCcr(file: ServiceFile): Promise<boolean> {
  if (file.token.length > 0) {
    const identity = await serviceRpc(file.url, "getServiceIdentity", [file.token]);
    return identity?.serviceTokenMatches === true && Number(identity.pid) === file.pid;
  }
  return (await serviceRpc(file.url, "getAppInfo", []))?.name === "Claude Code Router";
}

/** down: nothing answers; ccr: CCR's own daemon does; foreign: another process holds the port. */
export async function daemonState(
  ccrHome: string,
  address: string,
): Promise<"down" | "ccr" | "foreign"> {
  if (!(await isRunning(address))) {
    return "down";
  }
  return (await servicePid(ccrHome)) === undefined ? "foreign" : "ccr";
}

/** A rule a router must meet, broken: ensure's refusal, and doctor's row of the same name. */
interface Violation {
  readonly name: string;
  readonly code: Exclude<OutcomeCode, "ok">;
  readonly detail: string;
}

/** The port answers, but not as CCR's daemon. */
export function foreign(places: Places, address: string): Violation {
  return {
    name: "daemon",
    code: "blocked",
    detail: `${address} answers, but no CCR daemon of ${places.ccrHome} runs (its service.json names no live CCR daemon); another process holds the port: stop it, or change PORT in CCR config`,
  };
}

export async function waitFor(
  check: () => boolean | Promise<boolean>,
  ms: number,
): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check()) {
      return true;
    }
    await sleep(POLL_MS);
  }
  return check();
}

/** The daemon's environment: no router variable of a routed parent, plus the custom router. */
function daemonEnv(places: Places, env: Env): Record<string, string> {
  const out = withoutRouterEnv(env);
  const router = customRouterPath(places.stateDir);
  if (existsSync(router)) {
    out.CUSTOM_ROUTER_PATH = router;
  }
  return out;
}

/** SIGTERM to `pid`; to its whole process group only for a pid this run started (`group`), the
 * setsid leader `spawnDetached` made. A pid read from a file is never signalled as a group. */
function terminate(pid: number | undefined, group = false): void {
  if (pid === undefined) {
    return;
  }
  for (const target of group ? [-pid, pid] : [pid]) {
    try {
      process.kill(target, "SIGTERM");
    } catch {
      // already gone
    }
  }
}

/** What takeDown stops: CCR's daemon of `ccrHome` at `address` (none known yet: undefined), and
 * the `ccr start` this run spawned (`spawned`, the leader of its own process group), if any. */
interface Daemon {
  readonly env: Env;
  readonly ccrHome: string;
  readonly address?: string;
  readonly spawned?: number;
}

/** `ccr start` in its own session, its output in `log`: the handle takeDown stops it by. */
export function startDaemon(
  env: Record<string, string>,
  ccrHome: string,
  log: { readonly file: string; readonly append: boolean },
): Outcome<Daemon> {
  const started = spawnDetached("ccr", ["start"], log, env);
  return started.ok ? ok({ env, ccrHome, spawned: started.pid }) : fail("missing", started.reason);
}

/**
 * `ccr stop`, and SIGTERM to the start this run spawned (its process group) and to the daemon
 * CCR's service.json names; for a daemon this run did not spawn, the SIGTERM waits until the port
 * stays open after `ccr stop`. True once nothing answers at the address.
 */
export async function takeDown(daemon: Daemon): Promise<boolean> {
  const named = await servicePid(daemon.ccrHome);
  const ccr = binPath("ccr", daemon.env);
  if (ccr !== null) {
    spawnSync(ccr, ["stop"], {
      env: withoutRouterEnv(daemon.env),
      stdio: "ignore",
      timeout: STOP_RUN_MS,
    });
  }
  const { address } = daemon;
  const closed = async () => address === undefined || !(await isRunning(address));
  if (daemon.spawned !== undefined) {
    terminate(daemon.spawned, true);
    terminate(named);
  }
  const { stop } = waitsOf(daemon.env);
  if (await waitFor(closed, stop)) {
    return true;
  }
  terminate(named);
  terminate(await servicePid(daemon.ccrHome));
  return waitFor(closed, stop);
}

/** The rules every start, every running daemon a launch uses and every reload meet, each worded
 * once: CCR config present, no global profile, user settings readable and free of router values. */
export function guards(
  places: Places,
  config: Json | null,
  settings: Outcome<UserSettings>,
): Violation[] {
  const broken: Violation[] = [];
  if (config === null) {
    broken.push({
      name: "CCR config",
      code: "missing",
      detail: `no CCR config at ${places.ccrDb}; run qsm-setup activate qsm-ccr`,
    });
  }
  const globals = config === null ? [] : globalProfiles(config);
  if (globals.length > 0) {
    broken.push({
      name: "CCR profiles",
      code: "blocked",
      detail: `CCR profile ${globals.join(", ")} is global and would rewrite ${places.userSettings} on start; run qsm-setup activate qsm-ccr`,
    });
  }
  if (settings.data === undefined) {
    broken.push({
      name: "user settings",
      code: "failed",
      detail: settings.message ?? "",
    });
  }
  const gateway = config === null ? undefined : gatewayOf(config);
  const damage = settings.data === undefined ? [] : routerDamage(settings.data.json, gateway);
  if (damage.length > 0) {
    broken.push({
      name: "router values in user settings",
      code: "blocked",
      detail: `${places.userSettings} holds router values (${damage.join(", ")}); remove them by hand, qsm-ccr never does`,
    });
  }
  return broken;
}

interface Admitted {
  readonly gateway: Gateway;
  readonly config: Json;
}

/** The guards, refusing on the first broken one, and the address a start listens on. */
function admit(places: Places, config: Json | null): Outcome<Admitted> {
  const [broken] = guards(places, config, readUserSettings(places.userSettings));
  if (broken !== undefined) {
    return fail(broken.code, broken.detail);
  }
  const gateway = config === null ? undefined : gatewayOf(config);
  if (config === null || gateway === undefined) {
    return fail("missing", `CCR config at ${places.ccrDb} names no PORT and APIKEY`);
  }
  return ok({ gateway, config });
}

/** User settings, and every file a claude-code profile of CCR writes when global. */
function watchedSettings(places: Places, config: Json): string[] {
  return [...new Set([places.userSettings, ...claudeSettingsFiles(config, places.home)])];
}

function stillRuns(address: string): string {
  return `the daemon still runs at ${address}: stop it by hand (ccr stop)`;
}

/** One start and its proof, the port found closed. The caller holds the lock and ran the guards. */
async function startProven(
  places: Places,
  env: Env,
  admitted: Admitted,
): Promise<Outcome<Gateway>> {
  const { gateway, config } = admitted;
  const watched = watchedSettings(places, config);
  const before = snapshotOf(watched);
  mkdirSync(places.stateDir, { recursive: true, mode: 0o700 });
  const out = join(places.stateDir, "ccr.out");
  const started = startDaemon(daemonEnv(places, env), places.ccrHome, {
    file: out,
    append: true,
  });
  if (started.data === undefined) {
    return retag(started);
  }
  const daemon: Daemon = { ...started.data, env, address: gateway.address };
  const waits = waitsOf(env);
  if (!(await waitFor(() => isRunning(gateway.address), waits.start))) {
    const down = await takeDown(daemon);
    return fail(
      "failed",
      `ccr start opened no ${gateway.address} within ${waits.start / 1000} s; ${down ? "what it started is stopped" : stillRuns(gateway.address)}; see ${out}`,
    );
  }
  await sleep(waits.settle);
  const changed = settingsChanges(before, snapshotOf(watched));
  if (changed.length > 0) {
    const down = await takeDown(daemon);
    return fail(
      "failed",
      `the daemon start changed ${changed.join("; ")}; ${down ? "the daemon is stopped" : stillRuns(gateway.address)}; remove the change by hand`,
    );
  }
  return ok(gateway, `router started at ${gateway.address}`);
}

/** CCR's daemon as it already runs, through the guards: no lock, nothing started or stopped;
 * undefined when the port does not answer as CCR's daemon. */
export async function runningDaemon(places: Places): Promise<Outcome<Gateway> | undefined> {
  const config = readCcrConfig(places.ccrDb);
  const gateway = config === null ? undefined : gatewayOf(config);
  if (gateway === undefined || (await daemonState(places.ccrHome, gateway.address)) !== "ccr") {
    return undefined;
  }
  const admitted = admit(places, config);
  return admitted.data === undefined ? retag(admitted) : ok(admitted.data.gateway);
}

/**
 * The one door to a router a launch uses, under the lock: the guards once, then CCR's running
 * daemon as it is, or stopped first when `reload`, else a proven start. A refused reload leaves
 * the running router as it is; a port another process holds is refused.
 */
export async function ensureRunning(
  places: Places,
  env: Env,
  reload: boolean,
): Promise<Outcome<Gateway>> {
  const admitted = admit(places, readCcrConfig(places.ccrDb));
  if (admitted.data === undefined) {
    return reload
      ? retag(admitted, "; the running router keeps its old copy until a reload passes")
      : retag(admitted);
  }
  const { gateway } = admitted.data;
  const state = await daemonState(places.ccrHome, gateway.address);
  if (state === "foreign") {
    const { code, detail } = foreign(places, gateway.address);
    return fail(code, detail);
  }
  if (state === "ccr" && !reload) {
    return ok(gateway);
  }
  if (
    state === "ccr" &&
    !(await takeDown({
      env,
      ccrHome: places.ccrHome,
      address: gateway.address,
    }))
  ) {
    return fail(
      "failed",
      `ccr stop left the router with the old tokens and allowlist; ${stillRuns(gateway.address)}, then run qsm-ccr sync`,
    );
  }
  return startProven(places, env, admitted.data);
}
