// A sandbox machine for the end-to-end scenarios: HOME, Claude home, codex home, CCR home with a
// config.sqlite built here, a state dir, and fake claude, ccr, codex and qsm-ccr on a PATH that
// holds nothing of the person's. makeWorld throws if any of the four resolves elsewhere.
import { afterEach } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { connect, listen, spawn, which } from "bun";
import { cliShim, fakeBin } from "../../../../lib/fixtures/bin.ts";
import { dataOf, runBin } from "../../../../lib/fixtures/cli.ts";
import { sandboxDir } from "../../../../lib/fixtures/sandbox.ts";
import { isRecord } from "../../../../lib/outcome.ts";
import { type Json, parseJson } from "../parse.ts";
import { catalogJson, ccrConfig, createCcrDb, jwt, REFRESH } from "./ccr-db.ts";

const BUN = process.execPath;
const CLI = resolve(import.meta.dir, "../../scripts/cli.ts");
const SYSTEM_PATH = "/usr/bin:/bin";

export interface World {
  readonly root: string;
  readonly bin: string;
  readonly out: string;
  readonly mode: string;
  readonly port: number;
  readonly settingsPath: string;
  readonly ccrDb: string;
  readonly codexHome: string;
  readonly stateDir: string;
  readonly access: string;
  readonly env: Record<string, string>;
}

interface WorldOptions {
  /** user settings.json; omitted: no file */
  readonly settings?: Json | string;
  /** CCR config value; null: no config.sqlite */
  readonly ccr?: Json | null;
  /** models_cache.json; null: no file */
  readonly catalog?: Json | null;
  /** auth.json present (default true) */
  readonly auth?: boolean;
  /** access token exp, seconds since the epoch (default: 10 days ahead) */
  readonly accessExp?: number;
  readonly configToml?: string;
  /** CCR's port; omitted: a free one */
  readonly port?: number;
}

const pidFiles: string[] = [];
afterEach(() => {
  for (const file of pidFiles.splice(0)) {
    if (existsSync(file)) {
      try {
        process.kill(Number(readFileSync(file, "utf8")), "SIGKILL");
      } catch {
        // already gone
      }
    }
  }
});

/** A raw loopback listener on a port the OS picks. */
function listener() {
  return listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data: () => {} },
  });
}

export function freePort(): number {
  const server = listener();
  const { port } = server;
  server.stop(true);
  return port;
}

/** Something that is not CCR listening on a free port, connected to once before it is handed
 * out: here the first connect to a new listener can lose its SYN and take a second, as long as the
 * connect limit of the check under test. */
export async function foreignListener(): Promise<{
  readonly port: number;
  readonly stop: () => void;
}> {
  const server = listener();
  const socket = await connect({
    hostname: "127.0.0.1",
    port: server.port,
    socket: { data: () => {} },
  });
  socket.end();
  return {
    port: server.port,
    stop: () => {
      server.stop(true);
    },
  };
}

interface Dirs {
  readonly root: string;
  readonly bin: string;
  readonly out: string;
  readonly mode: string;
  readonly home: string;
  readonly claudeHome: string;
  readonly codexHome: string;
  readonly ccrHome: string;
  readonly xdgState: string;
}

function makeDirs(): Dirs {
  const root = sandboxDir("qsm-ccr-world-");
  const at = (name: string) => {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    return dir;
  };
  return {
    root,
    bin: at("bin"),
    out: at("out"),
    mode: at("mode"),
    home: at("home"),
    claudeHome: at("claude"),
    codexHome: at("codex"),
    ccrHome: at("ccr"),
    xdgState: at("state"),
  };
}

function writeSettings(settingsPath: string, settings: Json | string | undefined): void {
  if (settings === undefined) {
    return;
  }
  const text = typeof settings === "string" ? settings : `${JSON.stringify(settings, null, 2)}\n`;
  writeFileSync(settingsPath, text);
}

/** codex's home: auth.json (returns the access token), models_cache.json, config.toml. */
function writeCodexHome(d: Dirs, opts: WorldOptions): string {
  const access = jwt(opts.accessExp ?? Math.floor(Date.now() / 1000) + 10 * 86_400, "access");
  if (opts.auth !== false) {
    const tokens = {
      access_token: access,
      refresh_token: REFRESH,
      account_id: "acct-test",
    };
    writeFileSync(join(d.codexHome, "auth.json"), JSON.stringify({ tokens }));
  }
  if (opts.catalog !== null) {
    const catalog = opts.catalog ?? catalogJson();
    writeFileSync(join(d.codexHome, "models_cache.json"), JSON.stringify(catalog));
  }
  writeFileSync(join(d.mode, "next-catalog.json"), JSON.stringify(catalogJson()));
  if (opts.configToml !== undefined) {
    writeFileSync(join(d.codexHome, "config.toml"), opts.configToml);
  }
  return access;
}

function writeShims(d: Dirs): void {
  const fakes = import.meta.dir;
  for (const name of ["claude", "ccr", "codex"]) {
    fakeBin(d.bin, name, `exec "${BUN}" "${join(fakes, `fake-${name}.ts`)}" "${d.root}" "$@"`);
  }
  cliShim(d.bin, "qsm-ccr", CLI);
}

function assertIsolated(bin: string, path: string): void {
  for (const cmd of ["claude", "ccr", "codex", "qsm-ccr"]) {
    const found = which(cmd, { PATH: path });
    if (found === null || !found.startsWith(bin)) {
      throw new Error(`world isolation broken: ${cmd} resolves to ${found}`);
    }
  }
}

export function makeWorld(opts: WorldOptions = {}): World {
  const d = makeDirs();
  const port = opts.port ?? freePort();
  writeFileSync(join(d.mode, "port"), String(port));
  const settingsPath = join(d.claudeHome, "settings.json");
  writeSettings(settingsPath, opts.settings);
  const access = writeCodexHome(d, opts);
  const ccrDb = join(d.ccrHome, "config.sqlite");
  if (opts.ccr !== null) {
    createCcrDb(ccrDb, opts.ccr ?? ccrConfig(port));
  }
  writeShims(d);
  const env = {
    PATH: `${d.bin}:${SYSTEM_PATH}`,
    HOME: d.home,
    CLAUDE_CONFIG_DIR: d.claudeHome,
    CODEX_HOME: d.codexHome,
    CCR_INTERNAL_HOME_DIR: d.ccrHome,
    XDG_STATE_HOME: d.xdgState,
    // the fake daemon starts and stops in well under these; settle outlasts its 300 ms late write
    QSM_CCR_START_WAIT_MS: "3000",
    QSM_CCR_SETTLE_MS: "600",
    QSM_CCR_STOP_WAIT_MS: "1000",
  };
  assertIsolated(d.bin, env.PATH);
  pidFiles.push(join(d.out, "ccr.pid"));
  return {
    root: d.root,
    bin: d.bin,
    out: d.out,
    mode: d.mode,
    port,
    settingsPath,
    ccrDb,
    codexHome: d.codexHome,
    stateDir: join(d.xdgState, "qsm-ccr"),
    access,
    env,
  };
}

interface ClaudeLaunch {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export function claudeLaunches(world: World): ClaudeLaunch[] {
  return readdirSync(world.out)
    .filter((f) => f.startsWith("claude-"))
    .toSorted()
    .map((f) => launchOf(parseJson(readFileSync(join(world.out, f), "utf8"))));
}

function launchOf(raw: unknown): ClaudeLaunch {
  if (!isRecord(raw) || !Array.isArray(raw.argv) || !isRecord(raw.env)) {
    throw new Error("not a record of a claude launch");
  }
  return {
    argv: raw.argv.map(String),
    env: Object.fromEntries(Object.entries(raw.env).map(([key, value]) => [key, String(value)])),
  };
}

function callsOf(world: World, fake: "ccr" | "codex"): string[] {
  const file = join(world.out, `${fake}.calls`);
  return existsSync(file) ? readFileSync(file, "utf8").trim().split("\n") : [];
}

export const ccrCalls = (world: World): string[] => callsOf(world, "ccr");
export const codexCalls = (world: World): string[] => callsOf(world, "codex");

/** The verb of each fake ccr call from index `from` on, such as "start" or "stop". */
export function ccrVerbs(world: World, from = 0): string[] {
  return ccrCalls(world)
    .slice(from)
    .map((c) => c.split(" ")[0] ?? "");
}

/** The catalog the fake codex answers with next: codex's shape around these models. */
export function nextCatalog(world: World, models: readonly Json[]): void {
  writeFileSync(
    join(world.mode, "next-catalog.json"),
    JSON.stringify({ ...catalogJson(), models }),
  );
}

/** A file in qsm-ccr's own state directory, which exists only once something wrote there. */
export function writeState(world: World, name: string, text: string): void {
  mkdirSync(world.stateDir, { recursive: true });
  writeFileSync(join(world.stateDir, name), text);
}

/** Runs the entry script as the binary would run. */
export function runCcr(
  world: World,
  argv: readonly string[],
  extraEnv: Record<string, string> = {},
) {
  return runBin(CLI, argv, {
    env: { ...world.env, ...extraEnv },
    cwd: world.root,
  });
}

export interface DoctorRow {
  readonly name: string;
  readonly code: string;
  readonly detail: string;
}

function isDoctorRow(row: unknown): row is DoctorRow {
  return (
    isRecord(row) &&
    typeof row.name === "string" &&
    typeof row.code === "string" &&
    typeof row.detail === "string"
  );
}

/** The rows of the `doctor --json` output in `stdout`. */
export function checksOf(stdout: string): DoctorRow[] {
  const data = dataOf(stdout);
  if (!isRecord(data) || !Array.isArray(data.checks) || !data.checks.every(isDoctorRow)) {
    throw new Error(`doctor printed no checks: ${stdout}`);
  }
  return data.checks;
}

/** `qsm-ccr doctor --json` in the world: its stdout, its rows, and one row by its check's name. */
export function doctorJson(world: World) {
  const { stdout } = runCcr(world, ["doctor", "--json"]);
  const checks = checksOf(stdout);
  return {
    stdout,
    checks,
    row: (name: string) => checks.find((c) => c.name === name),
  };
}

/** Starts the entry script without waiting, for the concurrency scenario. */
export function startCcr(world: World, argv: readonly string[]) {
  return spawn([BUN, CLI, ...argv], {
    env: { ...world.env },
    cwd: world.root,
    stdout: "pipe",
    stderr: "pipe",
  });
}

export function setMode(world: World, name: string, value = ""): void {
  writeFileSync(join(world.mode, name), value);
}
