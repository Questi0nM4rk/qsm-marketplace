// sync: make CCR's copy match codex's. Order is the spec's: a catalog override blocks, codex
// refreshes its own catalog, a stale cache fails, the tokens and the allowlist are copied, and a
// token about to expire is worse. Every run appends one line to sync.log.
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { spawnDetached } from "../../../lib/detach.ts";
import {
  fail,
  fromThrown,
  OUTCOME_CODES,
  type Outcome,
  type OutcomeCode,
  ok,
  type Thrown,
} from "../../../lib/outcome.ts";
import type { Env } from "../../../lib/paths.ts";
import {
  type Catalog,
  catalogPath,
  DAY_MS,
  isOlderThanOneDay,
  listedModels,
  readCatalog,
} from "./catalog.ts";
import {
  gatewayIn,
  hasProvider,
  ownedFieldsChanged,
  readCcrConfig,
  withAllowlist,
  withTokens,
  writeCcrConfig,
} from "./ccr-config.ts";
import {
  authPath,
  catalogOverrideIn,
  configTomlPath,
  readCodexTokens,
  refreshCatalog,
  tokenExpiry,
} from "./codex.ts";
import { daemonState, ensureRunning, LOCK_WAIT_MS } from "./daemon.ts";
import { lockHeld, withLock } from "./lock.ts";
import type { Json } from "./parse.ts";
import { appendStateLine, type Places } from "./places.ts";
import { retag } from "./retag.ts";
import { CODEX_PROVIDER } from "./route.ts";

interface SyncData {
  readonly changed: readonly string[];
  readonly allowlist: readonly string[];
  readonly reloaded: boolean;
}

/** The spec's first steps: no catalog override, a codex login, codex's own refresh, a fresh cache. */
function refreshedCatalog(places: Places, env: Env, now: number): Outcome<Catalog> {
  const override = catalogOverrideIn(places.codexHome);
  if (override !== undefined) {
    return fail(
      "blocked",
      `${configTomlPath(places.codexHome)} names model_catalog_json (${override}), so codex echoes a static list; remove the line (qsm-setup activate qsm-ccr removes CCR's)`,
    );
  }
  if (readCodexTokens(places.codexHome) === null) {
    return noLogin(places);
  }
  // codex's refresh is a network call: not made for a CCR that cannot take the result
  const prerequisite = ccrWithProvider(places);
  if (prerequisite.data === undefined) {
    return retag(prerequisite);
  }
  const refreshFailure = refreshCatalog(env);
  if (refreshFailure !== null) {
    return fail("failed", refreshFailure);
  }
  const catalog = readCatalog(places.codexHome);
  if (catalog === null) {
    return fail("failed", `codex debug models wrote no ${catalogPath(places.codexHome)}`);
  }
  if (!catalog.readable) {
    return fail("failed", `${catalog.path} does not parse after codex debug models`);
  }
  if (isOlderThanOneDay(catalog.fetchedAt, now)) {
    return fail(
      "failed",
      `${catalog.path} is older than 24 hours after codex debug models; codex served its cache`,
    );
  }
  return ok(catalog);
}

/** CCR's config holding the codex-api provider, which only CCR's own import creates. */
function ccrWithProvider(places: Places): Outcome<Json> {
  const config = readCcrConfig(places.ccrDb);
  return config !== null && hasProvider(config, CODEX_PROVIDER)
    ? ok(config)
    : fail(
        "missing",
        `CCR config at ${places.ccrDb} has no ${CODEX_PROVIDER} provider with its Codex OAuth plugin; import Codex in CCR's own UI under that name, then run qsm-setup activate qsm-ccr`,
      );
}

function noLogin<T>(places: Places): Outcome<T> {
  return fail("missing", `${authPath(places.codexHome)} holds no codex login; run codex login`);
}

function syncUnlocked(places: Places, env: Env): Outcome<SyncData> {
  const refreshed = refreshedCatalog(places, env, Date.now());
  const catalog = refreshed.data;
  if (catalog === undefined) {
    return retag(refreshed);
  }
  // codex may refresh, and so rotate, its tokens during the call: only what it holds now is copied
  const tokens = readCodexTokens(places.codexHome);
  if (tokens === null) {
    return noLogin(places);
  }
  const allowlist = listedModels(catalog.models).map((m) => m.slug);
  if (allowlist.length === 0) {
    return fail(
      "failed",
      `${catalog.path} lists no model with visibility: list; the allowlist was kept as it was`,
    );
  }
  // read again: CCR may have saved while codex refreshed
  const ccr = ccrWithProvider(places);
  const config = ccr.data;
  if (config === undefined) {
    return retag(ccr);
  }
  const next = withAllowlist(withTokens(config, CODEX_PROVIDER, tokens), CODEX_PROVIDER, allowlist);
  const changed = ownedFieldsChanged(config, next, CODEX_PROVIDER);
  if (changed.length > 0) {
    writeCcrConfig(places.ccrDb, config, next);
  }
  const data: SyncData = { changed, allowlist, reloaded: false };
  const expiry = tokenExpiry(tokens.accessToken);
  if (expiry !== undefined && expiry - Date.now() < DAY_MS) {
    return fail(
      "worse",
      `codex's access token expires at ${new Date(expiry).toISOString()}; codex refreshes it on its next use, else run codex login`,
      data,
    );
  }
  return ok(
    data,
    changed.length === 0
      ? "CCR already matches codex"
      : `updated ${changed.join(", ")} in ${places.ccrDb}`,
  );
}

interface SyncLogLine {
  readonly at: number;
  readonly code: OutcomeCode;
  readonly message: string;
}

const SYNC_LOG = "sync.log";

export function appendSyncLog(stateDir: string, outcome: Outcome, at: number): void {
  const [message] = (outcome.message ?? "").split("\n");
  appendStateLine(stateDir, SYNC_LOG, `${new Date(at).toISOString()} ${outcome.code}: ${message}`);
}

const LINE = new RegExp(`^(\\S+) (${OUTCOME_CODES.join("|")}): (.*)$`);

/** The log only grows, a line per sync: its last 64 KiB hold hundreds of lines, far more than one
 * day writes, so the last good sync of a day is always in them and a read costs the same forever. */
const TAIL_BYTES = 65_536;

function logTail(path: string): string {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return "";
  }
  try {
    const { size } = fstatSync(fd);
    const from = Math.max(0, size - TAIL_BYTES);
    const tail = Buffer.alloc(size - from);
    readSync(fd, tail, 0, tail.length, from);
    const text = tail.toString("utf8");
    // a read that starts mid-file drops the line it starts inside
    return from === 0 ? text : text.slice(text.indexOf("\n") + 1);
  } finally {
    closeSync(fd);
  }
}

function syncLogLines(stateDir: string): SyncLogLine[] {
  return logTail(join(stateDir, SYNC_LOG))
    .split("\n")
    .flatMap((line) => {
      const [, at, written, message] = line.match(LINE) ?? [];
      const code = OUTCOME_CODES.find((c) => c === written);
      return at === undefined || code === undefined || message === undefined
        ? []
        : [{ at: Date.parse(at), code, message }];
    });
}

export function lastSyncLine(stateDir: string): SyncLogLine | undefined {
  return syncLogLines(stateDir).at(-1);
}

/** A sync that copied everything (ok) or only found the token near its end (worse) counts as
 * done: it lets a start proceed; failed, missing and blocked do not. */
export function carriesOn(o: { readonly code: OutcomeCode }): boolean {
  return o.code === "ok" || o.code === "worse";
}

function lastGoodSync(stateDir: string): number | undefined {
  return syncLogLines(stateDir).findLast(carriesOn)?.at;
}

/** The spec's freshness: the last good sync is under 24 hours old. */
export function syncIsFresh(stateDir: string, now: number): boolean {
  return !isOlderThanOneDay(lastGoodSync(stateDir), now);
}

/** The answer of a `--if-stale` sync that finds the last good one under a day old: nothing run. */
export function freshOutcome(): Outcome {
  return ok({ fresh: true }, "the last good sync is under 24 hours old; nothing run");
}

/** `qsm-ccr sync --if-stale` in a detached process, so the sessions of one moment queue one
 * refresh, not one each; the child appends its own line to sync.log, and its raw
 * output (a crash included) replaces sync.out. While the lock is held a sync is under way (alone,
 * or before a router start), so none is started beside it. */
export function startDetachedSync(places: Places, env: Env): Outcome {
  const log = join(places.stateDir, SYNC_LOG);
  if (lockHeld(places.stateDir)) {
    return ok({ started: false }, `a sync is already under way; its outcome goes to ${log}`);
  }
  const started = spawnDetached(
    "qsm-ccr",
    ["sync", "--if-stale"],
    { file: join(places.stateDir, "sync.out"), append: false },
    env,
  );
  return started.ok
    ? ok({ started: true }, `started a background sync; its outcome goes to ${log}`)
    : fail("missing", started.reason);
}

/** sync, then a reload when a field changed and CCR's daemon runs; one sync.log line. Caller
 * holds the lock. */
export async function syncAndReload(places: Places, env: Env): Promise<Outcome<SyncData | Thrown>> {
  let outcome: Outcome<SyncData | Thrown>;
  try {
    outcome = await syncThenReload(places, env);
  } catch (e) {
    outcome = fromThrown(e);
  }
  appendSyncLog(places.stateDir, outcome, Date.now());
  return outcome;
}

async function syncThenReload(places: Places, env: Env): Promise<Outcome<SyncData>> {
  const outcome = syncUnlocked(places, env);
  if (outcome.data === undefined || !carriesOn(outcome)) {
    return outcome;
  }
  const { changed, ...rest } = outcome.data;
  const gateway = gatewayIn(places.ccrDb);
  if (
    changed.length === 0 ||
    gateway === undefined ||
    (await daemonState(places.ccrHome, gateway.address)) !== "ccr"
  ) {
    return outcome;
  }
  const reloaded = await ensureRunning(places, env, true);
  return reloaded.code === "ok"
    ? { ...outcome, data: { changed, ...rest, reloaded: true } }
    : retag(reloaded);
}

/** `qsm-ccr sync` and activation's first sync: under the lock, one sync.log line whatever ends it.
 * With `ifStale` the last good sync is judged again once the lock is held, so the syncs queued
 * behind one that just finished run nothing. */
export async function lockedSync(places: Places, env: Env, ifStale = false): Promise<Outcome> {
  try {
    return await withLock(
      places.stateDir,
      () =>
        ifStale && syncIsFresh(places.stateDir, Date.now())
          ? freshOutcome()
          : syncAndReload(places, env),
      LOCK_WAIT_MS,
    );
  } catch (e) {
    // every sync appends its line, one whose lock stayed busy included
    const outcome = fromThrown(e);
    appendSyncLog(places.stateDir, outcome, Date.now());
    return outcome;
  }
}
