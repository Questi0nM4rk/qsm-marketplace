// The fake `ccr`: records each call; `start` behaves like CCR where it matters to qsm-ccr: it
// creates CCR's default config (every profile global) when none exists in its home, applies an
// enabled global claude-code profile to its settingsFile, `~` read as HOME the way CCR reads it
// (mode damage-on-start forces it), listens on PORT, and names its pid in service.json in its home
// until `ccr stop`. Its port answers CCR's management RPC (`getAppInfo`) the way CCR's daemon does,
// which is how qsm-ccr proves a service.json pid is CCR's. Modes: damage-after-listen writes the settings 300 ms after the port opens;
// start-never-listens never opens the port; stop-ignored makes `stop` do nothing, and
// sigterm-ignored makes the daemon outlive SIGTERM.
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { serve } from "bun";
import { isRecord } from "../../../../lib/outcome.ts";
import { ccrConfig, createCcrDb, readCcrValue } from "./ccr-db.ts";
import { need, readJsonObject } from "./read.ts";

const [rootArg, verb] = process.argv.slice(2);
const root = need(rootArg, "its fixture root");
const { env } = process;
appendFileSync(
  join(root, "out", "ccr.calls"),
  `${verb ?? ""} HOME=${env.HOME} CUSTOM_ROUTER_PATH=${env.CUSTOM_ROUTER_PATH ?? ""}\n`,
);
const mode = (name: string) => existsSync(join(root, "mode", name));
const home = need(env.HOME, "HOME");
const ccrHome = env.CCR_INTERNAL_HOME_DIR ?? join(home, ".claude-code-router");
const service = join(ccrHome, "service.json");

if (verb === "stop") {
  if (existsSync(service) && !mode("stop-ignored")) {
    try {
      process.kill(Number(readJsonObject(service).pid), "SIGTERM");
    } catch {
      // already gone
    }
    rmSync(service, { force: true });
  }
  process.exit(0);
}
if (verb !== "start") {
  process.exit(0);
}
const db = join(ccrHome, "config.sqlite");
if (!existsSync(db)) {
  createCcrDb(
    db,
    ccrConfig(Number(readFileSync(join(root, "mode", "port"), "utf8")), {
      fresh: true,
    }),
  );
}
const config = readCcrValue(db);
const port = Number(config.PORT);
const profiles =
  isRecord(config.profile) && Array.isArray(config.profile.profiles)
    ? config.profile.profiles.filter(isRecord)
    : [];
const claude = profiles.find((p) => p.agent === "claude-code");
const globalClaude =
  claude !== undefined &&
  claude.enabled !== false &&
  (claude.scope === undefined || claude.scope === "global");

function applyProfile(): void {
  const file = (
    typeof claude?.settingsFile === "string" ? claude.settingsFile : "~/.claude/settings.json"
  ).replace(/^~/, home);
  mkdirSync(dirname(file), { recursive: true });
  const settings = existsSync(file) ? readJsonObject(file) : {};
  const next = {
    ...settings,
    env: {
      ...(isRecord(settings.env) ? settings.env : {}),
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    },
  };
  writeFileSync(file, JSON.stringify(next, null, 2));
}

const damage = globalClaude || mode("damage-on-start");
if (damage && !mode("damage-after-listen")) {
  applyProfile();
}
writeFileSync(join(root, "out", "ccr.pid"), String(process.pid));
const TOKEN = "fake-web-token";
writeFileSync(
  service,
  JSON.stringify({
    pid: process.pid,
    url: `http://127.0.0.1:${port}/?ccr_web_token=${TOKEN}`,
  }),
);
process.on("SIGTERM", () => {
  if (!mode("sigterm-ignored")) {
    rmSync(service, { force: true });
    process.exit(0);
  }
});
if (mode("start-never-listens")) {
  setInterval(() => {}, 1000);
} else {
  serve({
    hostname: "127.0.0.1",
    port,
    fetch: (request) =>
      request.headers.get("x-ccr-web-auth") === TOKEN
        ? Response.json({ ok: true, value: { name: "Claude Code Router" } })
        : new Response("no", { status: 401 }),
  });
  if (damage && mode("damage-after-listen")) {
    setTimeout(applyProfile, 300);
  }
}
