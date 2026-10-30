// qsm-ccr through its real surface: the entry script's argv, stdout, stderr, exit, in a sandbox.

import { Database } from "bun:sqlite";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sleep } from "bun";
import { isAlive } from "../../../lib/detach.ts";
import { envelopeOf } from "../../../lib/fixtures/cli.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import {
  catalogJson,
  ccrAllowing,
  ccrConfig,
  ccrWithoutCodex,
  createCcrDb,
  GATEWAY_KEY,
  OLD_ACCESS,
  OLD_REFRESH,
  REFRESH,
  readCcrValue,
  recordsAt,
  withCcrFields,
} from "../lib/fixtures/ccr-db.ts";
import {
  ccrCalls,
  ccrVerbs,
  checksOf,
  claudeLaunches,
  codexCalls,
  doctorJson,
  foreignListener,
  freePort,
  makeWorld,
  nextCatalog,
  runCcr,
  setMode,
  startCcr,
  type World,
  writeState,
} from "../lib/fixtures/world.ts";
import { withLock } from "../lib/lock.ts";
import { placesOf } from "../lib/places.ts";
import { ROUTER_ENV } from "../lib/route.ts";
import { startDetachedSync } from "../lib/sync.ts";

const CLI = resolve(import.meta.dir, "cli.ts");
setDefaultTimeout(30_000);

function bare(argv: readonly string[]) {
  const home = sandboxDir("qsm-ccr-bare-");
  const env = { PATH: `${join(home, "bin")}:/usr/bin:/bin`, HOME: home };
  const r = spawnSync(process.execPath, [CLI, ...argv], {
    encoding: "utf8",
    env,
  });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("the contract", () => {
  test("--help lists the three verbs and names teammate mode", () => {
    const r = bare(["--help"]);
    expect(r.exit).toBe(0);
    for (const verb of ["lead", "sync", "doctor"]) {
      expect(r.stdout).toContain(verb);
    }
    expect(r.stdout).toContain("teammate mode");
    expect(r.stdout).toContain("--agent-name");
  });

  test("doctor runs from a plain shell and answers the envelope", () => {
    const r = bare(["doctor", "--json"]);
    const envelope = envelopeOf(r.stdout);
    expect(envelope.code).toBe("missing");
    expect(r.exit).toBe(4);
    const names = checksOf(r.stdout).map((c) => c.name);
    for (const name of ["claude on PATH", "ccr on PATH", "codex on PATH"]) {
      expect(names).toContain(name);
    }
  });
});

const TEAMMATE = [
  "--agent-id",
  "a@t",
  "--team-name",
  "t",
  "--parent-session-id",
  "p",
  "--agent-type",
  "general",
  "--permission-mode",
  "default",
];

describe("teammate mode", () => {
  test("a launch is recognised and runs claude, parsing no verb", () => {
    const w = makeWorld();
    const r = runCcr(w, [...TEAMMATE, "--agent-name", "planner"]);
    expect(r.exit).toBe(0);
    expect(claudeLaunches(w)).toHaveLength(1);
    expect(r.stderr).not.toContain("unknown verb");
  });

  test("a Claude teammate loses the forwarded router address and keeps --model", () => {
    const w = makeWorld();
    runCcr(
      w,
      [...TEAMMATE, "--agent-name", "planner", "--model", "sonnet"],
      Object.fromEntries(ROUTER_ENV.map((k) => [k, "forwarded"])),
    );
    const [launch] = claudeLaunches(w);
    expect(launch?.argv).toContain("--model");
    expect(launch?.argv).toContain("sonnet");
    expect(ROUTER_ENV.filter((k) => k in (launch?.env ?? {}))).toEqual([]);
  });

  test("a name with tabs and newlines logs one line, never a forged one", () => {
    const w = makeWorld();
    runCcr(w, [...TEAMMATE, "--agent-name", "x\tevil\nfake line"]);
    const lines = readFileSync(`${w.stateDir}/launch.log`, "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.split("\t")).toHaveLength(5);
  });

  test("unknown teammate arguments pass through unchanged", () => {
    const w = makeWorld();
    runCcr(w, [...TEAMMATE, "--agent-name", "planner", "--brand-new-flag", "v=1"]);
    const argv = claudeLaunches(w)[0]?.argv ?? [];
    expect(
      argv.slice(argv.indexOf("--brand-new-flag"), argv.indexOf("--brand-new-flag") + 2),
    ).toEqual(["--brand-new-flag", "v=1"]);
  });

  test("a launch without an agent name is refused loud, starts nothing, and is logged", () => {
    const w = makeWorld();
    const r = runCcr(w, ["--agent-id", "a@t", "--team-name", "t"]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("--agent-name");
    expect(claudeLaunches(w)).toHaveLength(0);
    expect(readFileSync(`${w.stateDir}/launch.log`, "utf8")).toContain("\t-\t-\t-\tusage");
  });

  test("the launch line names agent, provider and model, and the exit code is claude's", () => {
    const w = makeWorld();
    setMode(w, "claude-exit", "7");
    const r = runCcr(w, [...TEAMMATE, "--agent-name", "planner", "--model", "sonnet"]);
    expect(r.exit).toBe(7);
    expect(readFileSync(`${w.stateDir}/launch.log`, "utf8")).toMatch(
      /\tplanner\tclaude\tsonnet\tstarted\n$/,
    );
  });
});

describe("doctor on user settings", () => {
  test("a router model in user settings is failed naming the key and the value", () => {
    const w = makeWorld({ settings: { model: "anthropic/claude-ccr-0a1b" } });
    const r = runCcr(w, ["doctor", "--json"]);
    const envelope = envelopeOf(r.stdout);
    expect(envelope.code).toBe("failed");
    expect(envelope.message).toContain("model");
    expect(envelope.message).toContain("anthropic/claude-ccr-0a1b");
    expect(readFileSync(w.settingsPath, "utf8")).toContain("anthropic/claude-ccr-0a1b");
  });

  test("router keys in user settings are failed even when CCR config is absent", () => {
    const w = makeWorld({
      ccr: null,
      settings: {
        env: {
          ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
          ANTHROPIC_API_KEY: "x",
        },
      },
    });
    const row = doctorJson(w).row("router values in user settings");
    expect(row?.code).toBe("failed");
    expect(row?.detail).toContain("env.ANTHROPIC_BASE_URL");
    expect(row?.detail).toContain("env.ANTHROPIC_API_KEY");
  });

  test("a hidden catalog slug or an allowlisted slug as the model is failed", () => {
    for (const model of ["gpt-6.1-mini", "gpt-allow-only"]) {
      const w = makeWorld({
        settings: { model },
        ccr: withCcrFields(ccrConfig(freePort()), {
          providers: [
            { id: "codex-api", name: "Codex API", models: ["gpt-6.1-sol", "gpt-allow-only"] },
          ],
        }),
      });
      const row = doctorJson(w).row("user settings model");
      expect(row?.code).toBe("failed");
      expect(row?.detail).toContain(model);
    }
  });

  test("a catalog that does not parse is a failed row naming the file; the other checks still run", () => {
    const w = makeWorld();
    writeFileSync(join(w.codexHome, "models_cache.json"), "{ not json");
    const doctor = doctorJson(w);
    expect(doctor.row("codex catalog")?.code).toBe("failed");
    expect(doctor.row("codex catalog")?.detail).toContain(join(w.codexHome, "models_cache.json"));
    expect(doctor.checks.length).toBeGreaterThanOrEqual(8);
  });

  test("a teammate command that names no executable is missing naming the path and activation", () => {
    const w = makeWorld({
      settings: { env: { CLAUDE_CODE_TEAMMATE_COMMAND: "/nowhere/qsm-ccr" } },
    });
    const row = doctorJson(w).row("teammate command");
    expect(row?.code).toBe("missing");
    expect(row?.detail).toContain("/nowhere/qsm-ccr");
    expect(row?.detail).toContain("qsm-setup activate qsm-ccr");
  });
});

describe("doctor on CCR config", () => {
  test("drift is missing naming the model and sync, and every other check still runs", () => {
    const w = makeWorld({ ccr: ccrAllowing(freePort(), ["gpt-6.1"]) });
    const doctor = doctorJson(w);
    const row = doctor.row("default model in allowlist");
    expect(row?.code).toBe("missing");
    expect(row?.detail).toContain("gpt-6.1-sol");
    expect(row?.detail).toContain("qsm-ccr sync");
    expect(doctor.checks.length).toBeGreaterThanOrEqual(8);
  });

  test("an Anthropic provider is failed naming it", () => {
    const w = makeWorld({
      ccr: withCcrFields(ccrConfig(freePort()), {
        providers: [
          ...recordsAt(ccrConfig(1), "Providers"),
          { name: "anth", baseUrl: "https://api.anthropic.com" },
        ],
      }),
    });
    const envelope = envelopeOf(runCcr(w, ["doctor", "--json"]).stdout);
    expect(envelope.code).toBe("failed");
    expect(envelope.message).toContain("provider anth");
  });
});

describe("sync", () => {
  test("copies codex's tokens and sets the allowlist to every listed slug", () => {
    const w = makeWorld();
    nextCatalog(w, [
      ...recordsAt(catalogJson(), "models"),
      { slug: "gpt-7", visibility: "list", priority: 3 },
    ]);
    const r = runCcr(w, ["sync", "--json"]);
    expect(envelopeOf(r.stdout).code).toBe("ok");
    const c = readCcrValue(w.ccrDb);
    expect(recordsAt(c, "Providers")[0]?.models).toEqual(["gpt-6.1-sol", "gpt-6.1", "gpt-7"]);
    expect(JSON.stringify(c.providerPlugins)).toContain(REFRESH);
    expect(codexCalls(w)).toEqual(["debug models"]);
  });

  test("twice with no change at codex: the second writes nothing", () => {
    const w = makeWorld();
    runCcr(w, ["sync"]);
    const before = statSync(w.ccrDb).mtimeMs;
    const second = envelopeOf(runCcr(w, ["sync", "--json"]).stdout);
    expect(second.code).toBe("ok");
    expect(second).toMatchObject({ data: { changed: [] } });
    expect(statSync(w.ccrDb).mtimeMs).toBe(before);
  });
});

describe("sync refusals and freshness", () => {
  test("model_catalog_json in config.toml is blocked and codex is not run", () => {
    const w = makeWorld({
      configToml: 'model_catalog_json = "/h/.codex/ccr-model-catalog.json"\n',
    });
    const r = runCcr(w, ["sync", "--json"]);
    expect(envelopeOf(r.stdout).code).toBe("blocked");
    expect(codexCalls(w)).toEqual([]);
  });

  test("no auth.json is missing naming codex login", () => {
    const r = runCcr(makeWorld({ auth: false }), ["sync", "--json"]);
    const envelope = envelopeOf(r.stdout);
    expect(envelope.code).toBe("missing");
    expect(envelope.message).toContain("codex login");
  });

  test("a CCR without the codex-api provider is missing naming CCR's import, and codex is not run", () => {
    const w = makeWorld({ ccr: ccrWithoutCodex() });
    const envelope = envelopeOf(runCcr(w, ["sync", "--json"]).stdout);
    expect(envelope.code).toBe("missing");
    expect(envelope.message).toContain("import Codex in CCR");
    expect(codexCalls(w)).toEqual([]);
  });

  test("a cache codex did not refresh is failed naming the cache", () => {
    const w = makeWorld({
      catalog: catalogJson(new Date(Date.now() - 2 * 86_400_000)),
    });
    setMode(w, "codex-serves-cache");
    const envelope = envelopeOf(runCcr(w, ["sync", "--json"]).stdout);
    expect(envelope.code).toBe("failed");
    expect(envelope.message).toContain("models_cache.json");
  });

  test("a token expiring within a day is worse naming the time and no token", () => {
    const w = makeWorld({ accessExp: Math.floor(Date.now() / 1000) + 3600 });
    const r = runCcr(w, ["sync", "--json"]);
    const envelope = envelopeOf(r.stdout);
    expect(envelope.code).toBe("worse");
    expect(envelope.message).toMatch(/expires at \d{4}-\d{2}-\d{2}T/);
    expect(r.stdout + r.stderr).not.toContain(w.access);
    expect(r.stdout + r.stderr).not.toContain(REFRESH);
  });
});

/** A codex whose `debug models` first rewrites auth.json's refresh token, as a refresh does. */
function rotatingCodex(w: World, refresh: string): void {
  const rotate = `const f=process.env.CODEX_HOME+"/auth.json";const fs=require("fs");const a=JSON.parse(fs.readFileSync(f,"utf8"));a.tokens.refresh_token="${refresh}";fs.writeFileSync(f,JSON.stringify(a))`;
  const shim = join(w.bin, "codex");
  writeFileSync(
    shim,
    `#!/bin/sh\n"${process.execPath}" -e '${rotate}'\nexec "${process.execPath}" "${resolve(import.meta.dir, "../lib/fixtures/fake-codex.ts")}" "${w.root}" "$@"\n`,
  );
  chmodSync(shim, 0o755);
}

describe("sync copies what codex holds after its refresh, and fails loud", () => {
  test("tokens codex rotated during debug models are the ones CCR gets", () => {
    const w = makeWorld();
    rotatingCodex(w, "rt-rotated-4444");
    expect(envelopeOf(runCcr(w, ["sync", "--json"]).stdout).code).toBe("ok");
    expect(JSON.stringify(readCcrValue(w.ccrDb).providerPlugins)).toContain("rt-rotated-4444");
    expect(doctorJson(w).row("token copies")?.code).toBe("ok");
  });

  test("an auth.json that does not parse is failed naming the file, and sync.log has the line", () => {
    const w = makeWorld();
    writeFileSync(join(w.codexHome, "auth.json"), '{"tokens":{"access_token":"eyJabc');
    const envelope = envelopeOf(runCcr(w, ["sync", "--json"]).stdout);
    expect(envelope.code).toBe("failed");
    expect(envelope.message).toContain(join(w.codexHome, "auth.json"));
    expect(readFileSync(join(w.stateDir, "sync.log"), "utf8")).toContain("failed: ");
  });

  test("a parse error never prints the value it choked on", () => {
    const planted = "sk-unquoted-5555";
    for (const [file, text] of [
      ["config.toml", `experimental_bearer_token = ${planted}\n`],
      ["auth.json", `{"tokens":{"access_token":${planted}}}`],
    ] as const) {
      const w = makeWorld();
      writeFileSync(join(w.codexHome, file), text);
      const outs = [runCcr(w, ["sync", "--json"]), runCcr(w, ["sync"]), runCcr(w, ["doctor"])];
      const printed = outs.map((o) => o.stdout + o.stderr).join("");
      expect(printed).toContain(join(w.codexHome, file));
      expect(printed).not.toContain(planted);
      expect(readFileSync(join(w.stateDir, "sync.log"), "utf8")).not.toContain(planted);
    }
  });

  test("a catalog with no listed model is failed and the allowlist is kept", () => {
    const w = makeWorld();
    nextCatalog(w, [{ slug: "gpt-x", visibility: "hide" }]);
    const envelope = envelopeOf(runCcr(w, ["sync", "--json"]).stdout);
    expect(envelope.code).toBe("failed");
    expect(envelope.message).toContain("visibility: list");
    expect(recordsAt(readCcrValue(w.ccrDb), "Providers")[0]?.models).toEqual([
      "gpt-6.1-sol",
      "gpt-6.1",
    ]);
  });
});

/** Replaces the world's qsm-ccr with a script that records its arguments; returns the record. */
const recordingCcr = (w: World) => {
  const recorded = join(w.out, "qsm-ccr.args");
  writeFileSync(join(w.bin, "qsm-ccr"), `#!/bin/sh\necho "$@" >> "${recorded}"\n`);
  chmodSync(join(w.bin, "qsm-ccr"), 0o755);
  return recorded;
};

describe("sync in the background and doctor's view", () => {
  test("--if-stale two hours after a good sync answers ok and runs no codex", () => {
    const w = makeWorld();
    writeState(
      w,
      "sync.log",
      `${new Date(Date.now() - 2 * 3_600_000).toISOString()} ok: CCR already matches codex\n`,
    );
    const envelope = envelopeOf(runCcr(w, ["sync", "--if-stale", "--detach", "--json"]).stdout);
    expect(envelope.code).toBe("ok");
    expect(codexCalls(w)).toEqual([]);
  });

  test("the detached child is told --if-stale, so queued sessions refresh once", async () => {
    const w = makeWorld();
    const recorded = recordingCcr(w);
    startDetachedSync(placesOf(w.env), w.env);
    for (let i = 0; i < 100 && !existsSync(recorded); i += 1) {
      await sleep(100);
    }
    expect(readFileSync(recorded, "utf8").trim()).toBe("sync --if-stale");
  });

  test("a detached sync asked for while the lock is held starts none beside the one under way", async () => {
    const w = makeWorld();
    const recorded = recordingCcr(w);
    const release = Promise.withResolvers<void>();
    const held = withLock(w.stateDir, () => release.promise, 1000);
    const outcome = startDetachedSync(placesOf(w.env), w.env);
    release.resolve();
    await held;
    expect(outcome).toMatchObject({ code: "ok", data: { started: false } });
    expect(outcome.message).toContain(join(w.stateDir, "sync.log"));
    await sleep(300);
    expect(existsSync(recorded)).toBe(false);
  });

  test("two --if-stale syncs queued on a stale log refresh codex once", async () => {
    const w = makeWorld();
    const a = startCcr(w, ["sync", "--if-stale", "--json"]);
    const b = startCcr(w, ["sync", "--if-stale", "--json"]);
    expect([await a.exited, await b.exited]).toEqual([0, 0]);
    expect(codexCalls(w)).toEqual(["debug models"]);
  });

  test("a detached sync that fails is in sync.log and doctor names it", async () => {
    const w = makeWorld();
    setMode(w, "codex-fails");
    expect(envelopeOf(runCcr(w, ["sync", "--detach", "--json"]).stdout).code).toBe("ok");
    const log = join(w.stateDir, "sync.log");
    for (
      let i = 0;
      i < 100 && !(existsSync(log) && readFileSync(log, "utf8").includes("failed:"));
      i += 1
    ) {
      await sleep(100);
    }
    expect(readFileSync(log, "utf8")).toContain("failed: codex debug models exited 1");
    expect(envelopeOf(runCcr(w, ["doctor", "--json"]).stdout).message).toContain(
      "codex debug models exited 1",
    );
  });

  test("doctor fails when CCR's refresh token differs from codex's, printing neither", () => {
    const w = makeWorld();
    const doctor = doctorJson(w);
    const row = doctor.row("token copies");
    expect(row?.code).toBe("failed");
    expect(row?.detail).toContain("codex login");
    expect(row?.detail).toContain("qsm-ccr sync");
    expect(doctor.stdout).not.toContain(REFRESH);
  });
});

const routerEnv = (l: { env: Readonly<Record<string, string>> } | undefined) =>
  Object.fromEntries(Object.entries(l?.env ?? {}).filter(([k]) => k.startsWith("ANTHROPIC_")));

describe("routed teammates and the daemon", () => {
  test("a slug in the name selects the model; --model is dropped; one daemon starts", () => {
    const w = makeWorld();
    const r = runCcr(w, [...TEAMMATE, "--agent-name", "gpt-6.1-sol-reviewer", "--model", "sonnet"]);
    expect(r.exit).toBe(0);
    const [launch] = claudeLaunches(w);
    expect(launch?.argv).not.toContain("--model");
    expect(routerEnv(launch)).toEqual({
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${w.port}`,
      ANTHROPIC_API_KEY: GATEWAY_KEY,
      ANTHROPIC_MODEL: "codex-api,gpt-6.1-sol",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "codex-api,gpt-6.1-sol",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "codex-api,gpt-6.1-sol",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "codex-api,gpt-6.1-sol",
    });
    expect(launch?.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBe("400000");
    expect(ccrCalls(w).filter((c) => c.startsWith("start"))).toHaveLength(1);
  });

  test("a role-only name runs on the catalog's default", () => {
    const w = makeWorld();
    runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]);
    expect(claudeLaunches(w)[0]?.env.ANTHROPIC_MODEL).toBe("codex-api,gpt-6.1-sol");
  });

  test("a default out of the allowlist is missing naming it and sync, and starts nothing", () => {
    const w = makeWorld({ ccr: ccrAllowing(0, ["gpt-6.1"]) });
    const r = runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]);
    expect(r.exit).toBe(4);
    expect(r.stderr).toContain("gpt-6.1-sol");
    expect(r.stderr).toContain("qsm-ccr sync");
    expect(claudeLaunches(w)).toHaveLength(0);
    expect(ccrCalls(w)).toEqual([]);
  });

  test("two teammates at once start one daemon and both run on it", async () => {
    const w = makeWorld();
    const a = startCcr(w, [...TEAMMATE, "--agent-name", "gpt-a"]);
    const b = startCcr(w, [...TEAMMATE, "--agent-name", "gpt-b"]);
    expect([await a.exited, await b.exited]).toEqual([0, 0]);
    expect(ccrCalls(w).filter((c) => c.startsWith("start"))).toHaveLength(1);
    expect(claudeLaunches(w)).toHaveLength(2);
  });
});

describe("the daemon's guards", () => {
  test("a global profile blocks the start naming the profile and activation", () => {
    const w = makeWorld();
    createCcrDb(w.ccrDb, {
      ...ccrConfig(w.port),
      profile: ccrConfig(w.port, { fresh: true }).profile,
    });
    const r = runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]);
    expect(r.exit).toBe(5);
    expect(r.stderr).toContain("default-claude-code");
    expect(r.stderr).toContain("qsm-setup activate qsm-ccr");
    expect(ccrCalls(w)).toEqual([]);
  });

  test("damage already in user settings blocks the start and leaves the file byte-identical", () => {
    const w = makeWorld();
    writeFileSync(
      w.settingsPath,
      `{\n  "env": { "ANTHROPIC_BASE_URL": "http://localhost:${w.port}" }\n}\n`,
    );
    const before = readFileSync(w.settingsPath);
    const r = runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]);
    expect(r.exit).toBe(5);
    expect(r.stderr).toContain("env.ANTHROPIC_BASE_URL");
    expect(r.stderr).toContain(w.settingsPath);
    expect(readFileSync(w.settingsPath).equals(before)).toBe(true);
    expect(ccrCalls(w)).toEqual([]);
  });

  test("a start that wrote user settings is stopped and failed naming each changed key", () => {
    const w = makeWorld({ settings: { model: "opus" } });
    setMode(w, "damage-on-start");
    const r = stoppedForDamage(w);
    // CCR's profile writes ~/.claude/settings.json by HOME, whatever CLAUDE_CONFIG_DIR says
    expect(r.stderr).toContain(join(w.root, "home", ".claude", "settings.json"));
    expect(ccrVerbs(w)).toEqual(["start", "stop"]);
  });

  test("a sync that does not answer ok stops the start with its outcome", () => {
    const w = makeWorld({ auth: false });
    const r = runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]);
    expect(r.exit).toBe(4);
    expect(r.stderr).toContain("codex login");
    expect(ccrCalls(w)).toEqual([]);
  });
});

/** A teammate start that must stop for damaged user settings: exit 1, the key named, no claude. */
const stoppedForDamage = (w: World) => {
  const r = runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]);
  expect(r.exit).toBe(1);
  expect(r.stderr).toContain("env.ANTHROPIC_BASE_URL");
  expect(claudeLaunches(w)).toHaveLength(0);
  return r;
};

const daemonPid = (w: World) => Number(readFileSync(join(w.out, "ccr.pid"), "utf8"));
const newCatalog = (w: World) => {
  nextCatalog(w, [{ slug: "gpt-7", visibility: "list" }]);
};
/** A world whose router a teammate started, and how many ccr calls that took. */
const started = () => {
  const w = makeWorld();
  runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]);
  return { w, calls: ccrCalls(w).length };
};

describe("the daemon is CCR's and guarded on every path", () => {
  test("a port another process holds is blocked naming it: no ccr, no codex, no claude", async () => {
    const other = await foreignListener();
    const w = makeWorld({ port: other.port });
    try {
      const r = runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]);
      expect(r.exit).toBe(5);
      expect(r.stderr).toContain(`127.0.0.1:${w.port}`);
      expect(ccrCalls(w)).toEqual([]);
      expect(codexCalls(w)).toEqual([]);
      expect(claudeLaunches(w)).toHaveLength(0);
      expect(doctorJson(w).row("daemon")?.code).toBe("blocked");
    } finally {
      other.stop();
    }
  });

  test("a running daemon still meets the guards: a global profile, then damage, block the launch", () => {
    const w = makeWorld();
    expect(runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]).exit).toBe(0);
    const guarded = readCcrValue(w.ccrDb);
    createCcrDb(w.ccrDb, {
      ...guarded,
      profile: ccrConfig(w.port, { fresh: true }).profile,
    });
    const global = runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]);
    expect(global.exit).toBe(5);
    expect(global.stderr).toContain("default-claude-code");
    createCcrDb(w.ccrDb, guarded);
    writeFileSync(w.settingsPath, JSON.stringify({ env: { ANTHROPIC_API_KEY: "x" } }));
    const damaged = runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]);
    expect(damaged.exit).toBe(5);
    expect(damaged.stderr).toContain("env.ANTHROPIC_API_KEY");
    expect(claudeLaunches(w)).toHaveLength(1);
  });

  test("a reload whose restart the guards refuse leaves the running router alone", () => {
    const { w, calls } = started();
    writeFileSync(w.settingsPath, JSON.stringify({ env: { ANTHROPIC_API_KEY: "x" } }));
    newCatalog(w);
    expect(envelopeOf(runCcr(w, ["sync", "--json"]).stdout).code).toBe("blocked");
    expect(ccrCalls(w).slice(calls)).toEqual([]);
    expect(isAlive(daemonPid(w))).toBe(true);
  });
});

describe("a start or a reload proves the daemon down", () => {
  test("a start that never opens the port is taken down and failed", () => {
    const w = makeWorld();
    setMode(w, "start-never-listens");
    const r = runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]);
    expect(r.exit).toBe(1);
    expect(r.stderr).toContain("opened no");
    expect(isAlive(daemonPid(w))).toBe(false);
  }, 60_000);

  test("a start that changed settings is taken down even when ccr stop does nothing", () => {
    const w = makeWorld({ settings: { model: "opus" } });
    setMode(w, "damage-on-start");
    setMode(w, "stop-ignored");
    const r = runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]);
    expect(r.exit).toBe(1);
    expect(r.stderr).toContain("the daemon is stopped");
    expect(isAlive(daemonPid(w))).toBe(false);
  }, 60_000);

  test("a daemon that outlives ccr stop and SIGTERM is named running, never stopped", () => {
    const w = makeWorld({ settings: { model: "opus" } });
    for (const mode of ["damage-on-start", "stop-ignored", "sigterm-ignored"]) {
      setMode(w, mode);
    }
    const r = runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]);
    expect(r.exit).toBe(1);
    expect(r.stderr).not.toContain("the daemon is stopped");
    expect(r.stderr).toContain(`still runs at http://127.0.0.1:${w.port}`);
  }, 60_000);

  test("a reload whose stop leaves the old daemon running is failed, never reloaded", () => {
    const { w, calls } = started();
    setMode(w, "stop-ignored");
    setMode(w, "sigterm-ignored");
    newCatalog(w);
    const envelope = envelopeOf(runCcr(w, ["sync", "--json"]).stdout);
    expect(envelope.code).toBe("failed");
    expect(envelope.message).toContain("still runs");
    expect(ccrVerbs(w, calls)).toEqual(["stop"]);
  }, 60_000);

  test("settings written a moment after the port opens are still caught", () => {
    const w = makeWorld({ settings: { model: "opus" } });
    setMode(w, "damage-on-start");
    setMode(w, "damage-after-listen");
    stoppedForDamage(w);
  });
});

describe("sync reloads and keeps secrets", () => {
  test("the custom router file reaches the daemon start as CUSTOM_ROUTER_PATH", () => {
    const w = makeWorld();
    writeState(w, "custom-router.js", "module.exports = async () => undefined;\n");
    runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]);
    expect(ccrCalls(w)[0]).toContain(`CUSTOM_ROUTER_PATH=${join(w.stateDir, "custom-router.js")}`);
  });

  test("sync with a running daemon reloads only when a field changed", () => {
    // the start synced too: the tokens changed
    const { w, calls } = started();
    expect(envelopeOf(runCcr(w, ["sync", "--json"]).stdout)).toMatchObject({
      data: { reloaded: false },
    });
    expect(ccrCalls(w)).toHaveLength(calls);
    nextCatalog(w, [{ slug: "gpt-7", visibility: "list", priority: 0 }]);
    expect(envelopeOf(runCcr(w, ["sync", "--json"]).stdout)).toMatchObject({
      data: { reloaded: true },
    });
    expect(ccrVerbs(w, calls)).toEqual(["stop", "start"]);
  });

  test("a token expiring within a day is printed and the start proceeds", () => {
    const w = makeWorld({ accessExp: Math.floor(Date.now() / 1000) + 3600 });
    const r = runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]);
    expect(r.exit).toBe(0);
    expect(r.stderr).toContain("expires at");
    expect(claudeLaunches(w)).toHaveLength(1);
  });
});

describe("a throw is a logged refusal, and doctor runs every check", () => {
  test("a CCR config that does not parse refuses the teammate through launch.log", () => {
    const w = makeWorld();
    createCcrDb(w.ccrDb, {});
    const raw = new Database(w.ccrDb);
    raw.run("UPDATE app_config SET value_json = '{ broken'");
    raw.close();
    const r = runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]);
    expect(r.exit).toBe(1);
    expect(r.stderr).toContain(`${w.ccrDb} holds a value_json that does not parse`);
    expect(r.stderr).not.toContain("    at ");
    expect(readFileSync(join(w.stateDir, "launch.log"), "utf8")).toContain(
      "\tgpt-reviewer\tcodex-api\t-\tfailed: ",
    );
  });

  test("doctor over files that do not parse answers each as a failed row and runs the rest", () => {
    const w = makeWorld();
    writeFileSync(join(w.codexHome, "auth.json"), '{"tokens":{"access_token":"eyJabc');
    const raw = new Database(w.ccrDb);
    raw.run("UPDATE app_config SET value_json = '{ broken'");
    raw.close();
    const { row } = doctorJson(w);
    expect(row("codex login")?.code).toBe("failed");
    expect(row("codex login")?.detail).toContain(join(w.codexHome, "auth.json"));
    expect(row("CCR config")?.code).toBe("failed");
    expect(row("CCR config")?.detail).toContain(w.ccrDb);
    expect(row("claude on PATH")?.code).toBe("ok");
    expect(row("router values in user settings")?.code).toBe("ok");
    expect(row("last sync")?.code).toBe("missing");
  });
});

describe("secrets and a healthy machine", () => {
  test("no token or gateway key reaches any output, envelope or log, lead and detached sync included", async () => {
    const w = makeWorld();
    const outs = [
      runCcr(w, [...TEAMMATE, "--agent-name", "gpt-reviewer"]),
      runCcr(w, ["sync"]),
      runCcr(w, ["sync", "--json"]),
      runCcr(w, ["lead", "--json"]),
      runCcr(w, ["lead", "gpt-unknown", "--json"]),
      runCcr(w, ["doctor"]),
      runCcr(w, ["doctor", "--json"]),
    ];
    setMode(w, "codex-fails");
    outs.push(runCcr(w, ["sync", "--json"]), runCcr(w, ["sync", "--detach", "--json"]));
    // the foreground sync wrote its failed line already; the detached child writes the second,
    // and until it has, it can still make the state directory the test removes
    const syncLog = join(w.stateDir, "sync.log");
    const failures = () => readFileSync(syncLog, "utf8").split("network").length - 1;
    for (let i = 0; i < 100 && failures() < 2; i += 1) {
      await sleep(100);
    }
    const logs = ["launch.log", "sync.log", "sync.out", "ccr.out"].map((f) =>
      readFileSync(join(w.stateDir, f), "utf8"),
    );
    const text = outs.map((o) => o.stdout + o.stderr).join("") + logs.join("");
    for (const secret of [w.access, REFRESH, GATEWAY_KEY, OLD_ACCESS, OLD_REFRESH]) {
      expect(text).not.toContain(secret);
    }
  });

  test("a healthy machine with the daemon down is ok and says so", () => {
    const w = makeWorld();
    writeFileSync(
      w.settingsPath,
      JSON.stringify({
        env: { CLAUDE_CODE_TEAMMATE_COMMAND: join(w.bin, "qsm-ccr") },
      }),
    );
    runCcr(w, ["sync"]);
    const envelope = envelopeOf(runCcr(w, ["doctor", "--json"]).stdout);
    expect(envelope.code).toBe("ok");
    expect(envelope.message).toContain("not running");
  });
});

describe("lead", () => {
  test("a Claude model is never routed: missing naming it, nothing started", () => {
    const w = makeWorld();
    const r = runCcr(w, ["lead", "sonnet", "--json"]);
    const envelope = envelopeOf(r.stdout);
    expect(envelope.code).toBe("missing");
    expect(envelope.message).toContain("sonnet is absent from every allowlist");
    expect(ccrCalls(w)).toEqual([]);
    expect(claudeLaunches(w)).toHaveLength(0);
  });

  test("a slug outside the allowlist is missing naming the slug and the allowlist", () => {
    const envelope = envelopeOf(runCcr(makeWorld(), ["lead", "gpt-unknown", "--json"]).stdout);
    expect(envelope.code).toBe("missing");
    expect(envelope.message).toContain("gpt-unknown");
    expect(envelope.message).toContain("gpt-6.1-sol, gpt-6.1");
  });

  test("the lead runs routed with its own binary as the teammate command and its arguments", () => {
    const w = makeWorld({
      settings: { env: { CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1" } },
    });
    const r = runCcr(w, ["lead", "--", "--resume", "--model", "opus"], {
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
    });
    expect(r.exit).toBe(0);
    const [launch] = claudeLaunches(w);
    expect(launch?.env.ANTHROPIC_MODEL).toBe("codex-api,gpt-6.1-sol");
    expect(launch?.env.CLAUDE_CODE_TEAMMATE_COMMAND).toBe(join(w.bin, "qsm-ccr"));
    expect(launch?.env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY).toBeUndefined();
    expect(launch?.argv).toEqual(["--resume"]);
  });

  test("user settings that no longer parse after the lead are failed naming the file", () => {
    const w = makeWorld({ settings: { model: "opus" } });
    setMode(w, "claude-breaks-settings");
    const envelope = envelopeOf(runCcr(w, ["lead", "--json"]).stdout);
    expect(envelope.code).toBe("failed");
    expect(envelope.message).toContain(w.settingsPath);
    expect(readFileSync(w.settingsPath, "utf8")).toBe("{ broken");
  });

  test("a lead that changed user settings model is failed naming the value, and the file is not rewritten", () => {
    const w = makeWorld({ settings: { model: "opus" } });
    setMode(w, "claude-writes-model");
    const envelope = envelopeOf(runCcr(w, ["lead", "--json"]).stdout);
    expect(envelope.code).toBe("failed");
    expect(envelope.message).toContain("anthropic/claude-ccr-abc123");
    // another session's /model lands here too: the message states the fact, not who did it
    expect(envelope.message).toContain("model changed while the lead ran");
    expect(envelope.message).not.toContain("the lead changed");
    expect(JSON.parse(readFileSync(w.settingsPath, "utf8"))).toMatchObject({
      model: "anthropic/claude-ccr-abc123",
    });
  });

  test("a signal's exit code (128 and over) is the lead's exit code: Ctrl-C stays 130", () => {
    const w = makeWorld();
    setMode(w, "claude-exit", "130");
    const r = runCcr(w, ["lead", "--json"]);
    expect(r.exit).toBe(130);
    expect(envelopeOf(r.stdout)).toMatchObject({ code: "failed", exit: 130 });
    expect(envelopeOf(r.stdout).message).toContain("claude exited 130");
  });

  test("any other claude exit is failed, exit 1, naming claude's code: the outcome table's 2 to 5 are not claude's", () => {
    for (const code of ["1", "2", "4", "127"]) {
      const w = makeWorld();
      setMode(w, "claude-exit", code);
      const r = runCcr(w, ["lead", "--json"]);
      expect(r.exit).toBe(1);
      expect(envelopeOf(r.stdout)).toMatchObject({ code: "failed", exit: 1 });
      expect(envelopeOf(r.stdout).message).toContain(`claude exited ${code}`);
    }
  });

  test("the two failure paths after the lead keep a signal's exit, and only a signal's", () => {
    for (const [mode, claudeExit, expected] of [
      ["claude-breaks-settings", "130", 130],
      ["claude-writes-model", "130", 130],
      ["claude-breaks-settings", "4", 1],
      ["claude-writes-model", "4", 1],
    ] as const) {
      const w = makeWorld({ settings: { model: "opus" } });
      setMode(w, mode);
      setMode(w, "claude-exit", claudeExit);
      const r = runCcr(w, ["lead", "--json"]);
      expect(envelopeOf(r.stdout)).toMatchObject({
        code: "failed",
        exit: expected,
      });
      expect(r.exit).toBe(expected);
    }
  });
});
