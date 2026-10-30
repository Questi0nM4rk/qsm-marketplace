// Activation through its contract, in the sandbox world; the throwaway bootstrap uses the fake
// ccr, which applies a global claude-code profile like CCR does.
import { Database } from "bun:sqlite";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { TOML } from "bun";
import { globalProfiles } from "../lib/ccr-config.ts";
import { ccrConfig, ccrWithoutCodex, readCcrValue } from "../lib/fixtures/ccr-db.ts";
import { ccrCalls, foreignListener, makeWorld, type World } from "../lib/fixtures/world.ts";
import { activation } from "./activate.ts";

setDefaultTimeout(60_000);

const run = (w: World, dryRun = false) => activation.activate({ dryRun, env: w.env, choices: {} });
const bytes = (path: string) =>
  existsSync(path) ? readFileSync(path).toString("base64") : "absent";
const toml = (w: World) => join(w.codexHome, "config.toml");
const files = (w: World) => [bytes(w.settingsPath), bytes(w.ccrDb), bytes(toml(w))];
const unguarded = (port: number) => ({
  ...ccrConfig(port),
  profile: ccrConfig(port, { fresh: true }).profile,
});

const CCR_TOML = `model = "m"
model_provider = "claude-code-router"
model_catalog_json = "/h/.codex/ccr-model-catalog.json"
# mine

[model_providers.claude-code-router]
base_url = "http://127.0.0.1:3456/v1"
experimental_bearer_token = "gw-secret"
wire_api = "responses"

[profiles.x]
model = "y"
`;
const NATIVE_TOML = 'model = "m"\n# mine\n\n[profiles.x]\nmodel = "y"\n';
/** The machine before activation: a setting of the person's, CCR's defaults, codex pointed at CCR. */
const unguardedWorld = () =>
  makeWorld({ settings: { theme: "dark" }, ccr: unguarded(0), configToml: CCR_TOML });

describe("activation", () => {
  test("a dry run names each change and writes nothing", async () => {
    const w = unguardedWorld();
    const before = files(w);
    const r = await run(w, true);
    expect(r.steps.map((s) => s.status)).not.toContain("installed");
    expect(r.detail).toContain("would set profile default-claude-code, default-codex");
    expect(r.detail).toContain("would remove model_provider, model_catalog_json");
    expect(r.detail).toContain("would write CLAUDE_CODE_TEAMMATE_COMMAND");
    expect(files(w)).toEqual(before);
    expect(readdirSync(w.codexHome).filter((f) => f.includes("bak"))).toEqual([]);
    expect(ccrCalls(w)).toEqual([]);
  });

  test("activation guards, returns codex to native, writes the command; a second run is already everywhere", async () => {
    const w = unguardedWorld();
    const first = await run(w);
    expect(first.status).toBe("installed");
    expect(globalProfiles(readCcrValue(w.ccrDb))).toEqual([]);
    expect(readFileSync(toml(w), "utf8")).toBe(NATIVE_TOML);
    expect(readFileSync(`${toml(w)}.qsm-ccr.bak`, "utf8")).toBe(CCR_TOML);
    expect(first.detail).toContain("model_provider, model_catalog_json");
    expect(first.detail).toContain("[model_providers.claude-code-router]");
    expect(JSON.parse(readFileSync(w.settingsPath, "utf8"))).toEqual({
      theme: "dark",
      env: { CLAUDE_CODE_TEAMMATE_COMMAND: join(w.bin, "qsm-ccr") },
    });
    expect(activation.status(w.env)).toBe("activated");
    const before = files(w);
    const second = await run(w);
    expect(second.steps.map((s) => s.status)).toEqual(second.steps.map(() => "already"));
    expect(files(w)).toEqual(before);
    expect(readFileSync(`${toml(w)}.qsm-ccr.bak`, "utf8")).toBe(CCR_TOML);
  });

  test("the removal is proved by parsing: the person's keys survive, CCR's are gone, a second run changes nothing", async () => {
    const w = makeWorld({ ccr: unguarded(0), configToml: CCR_TOML });
    await run(w);
    const parsed: unknown = TOML.parse(readFileSync(toml(w), "utf8"));
    expect(parsed).toEqual({ model: "m", profiles: { x: { model: "y" } } });
    const after = bytes(toml(w));
    const second = await run(w);
    expect(second.steps.find((s) => s.name === "codex native config")?.status).toBe("already");
    expect(bytes(toml(w))).toBe(after);
  });

  test.each([
    ["a quoted key", 'model = "m"\n"model_provider" = "claude-code-router"\n'],
    [
      "a multi-line value",
      'model = "m"\nmodel_catalog_json = """\n/h/.codex/ccr-model-catalog.json"""\n',
    ],
  ])(
    "%s the line edit cannot remove is an error naming the file, left as it was",
    async (_, text) => {
      const w = makeWorld({ ccr: unguarded(0), configToml: text });
      const step = (await run(w)).steps.find((s) => s.name === "codex native config");
      expect(step?.status).toBe("error");
      expect(step?.detail).toContain(toml(w));
      expect(step?.detail).toContain("by hand");
      expect(readFileSync(toml(w), "utf8")).toBe(text);
      expect(existsSync(`${toml(w)}.qsm-ccr.bak`)).toBe(false);
    },
  );

  test("the files the person owns keep their mode and no temp file is left beside them", async () => {
    const w = unguardedWorld();
    chmodSync(w.settingsPath, 0o600);
    chmodSync(toml(w), 0o640);
    await run(w);
    expect(statSync(w.settingsPath).mode & 0o777).toBe(0o600);
    expect(statSync(toml(w)).mode & 0o777).toBe(0o640);
    expect(statSync(`${toml(w)}.qsm-ccr.bak`).mode & 0o777).toBe(0o640);
    expect(readdirSync(w.codexHome).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    expect(readdirSync(join(w.settingsPath, ".."))).toEqual(["settings.json"]);
  });

  test("a temp file a killed write left beside a file it edits is swept and named", async () => {
    const w = unguardedWorld();
    const leftover = join(w.codexHome, ".config.toml.0123456789ab.tmp");
    writeFileSync(leftover, "half");
    const old = new Date(Date.now() - 3_600_000);
    utimesSync(leftover, old, old);
    const first = await run(w);
    expect(first.detail).toContain(`removed the leftover ${leftover}`);
    expect(existsSync(leftover)).toBe(false);
    expect((await run(w)).detail).not.toContain("leftover");
  });

  test("the backup of codex's config is made once and holds the original, never an edited copy", async () => {
    const w = makeWorld({ ccr: unguarded(0), configToml: CCR_TOML });
    await run(w);
    writeFileSync(
      toml(w),
      `${readFileSync(toml(w), "utf8")}[model_providers.ccr]\nbase_url = "http://127.0.0.1:3456"\n`,
    );
    await run(w);
    expect(readFileSync(toml(w), "utf8")).toBe(NATIVE_TOML);
    expect(readFileSync(`${toml(w)}.qsm-ccr.bak`, "utf8")).toBe(CCR_TOML);
  });

  test("a codex config that does not parse is an error naming it, left as it was", async () => {
    const w = makeWorld({ ccr: unguarded(0), configToml: "= nope [" });
    const r = await run(w);
    const step = r.steps.find((s) => s.name === "codex native config");
    expect(step?.status).toBe("error");
    expect(step?.detail).toContain(toml(w));
    expect(readFileSync(toml(w), "utf8")).toBe("= nope [");
  });

  test("a settings file that does not parse is an error naming it, left as it was", async () => {
    const w = makeWorld({ settings: "{ broken" });
    const before = files(w);
    const step = (await run(w)).steps.find((s) => s.name === "teammate command");
    expect(step?.status).toBe("error");
    expect(step?.detail).toContain(w.settingsPath);
    expect(files(w)).toEqual(before);
  });

  test("a CCR without the codex-api provider is missing-prereq naming CCR's own import", async () => {
    const w = makeWorld({ ccr: ccrWithoutCodex() });
    const step = (await run(w)).steps.find((s) => s.name === "codex-api provider");
    expect(step?.status).toBe("missing-prereq");
    expect(step?.detail).toContain("import Codex in CCR");
    expect(readCcrValue(w.ccrDb).Providers).toEqual([]);
  });

  test("a running router blocks the guard and nothing is written to CCR config", async () => {
    const server = await foreignListener();
    const w = makeWorld({ ccr: unguarded(server.port) });
    try {
      const r = await run(w);
      const step = r.steps.find((s) => s.name === "ccr profile guard");
      expect(step?.status).toBe("error");
      expect(step?.detail).toContain("ccr stop");
      expect(globalProfiles(readCcrValue(w.ccrDb))).toEqual([
        "default-claude-code",
        "default-codex",
      ]);
      // no sync ran: it would stop a router the guard could not let restart
      expect(r.steps.find((s) => s.name === "first sync")?.status).toBe("skipped");
      expect(ccrCalls(w)).toEqual([]);
    } finally {
      server.stop();
    }
  });

  test("bootstrap in a throwaway HOME leaves user settings byte-identical and no global profile", async () => {
    const w = makeWorld({ ccr: null, settings: { model: "opus" } });
    const r = await run(w);
    expect(r.steps.find((s) => s.name === "ccr profile guard")?.status).toBe("installed");
    // the fake daemon applied its global claude-code profile; only the throwaway HOME saw it. The
    // one key in user settings afterwards is the teammate command's own step.
    expect(JSON.parse(readFileSync(w.settingsPath, "utf8"))).toEqual({
      model: "opus",
      env: { CLAUDE_CODE_TEAMMATE_COMMAND: join(w.bin, "qsm-ccr") },
    });
    expect(globalProfiles(readCcrValue(w.ccrDb))).toEqual([]);
    // it will hold the gateway key and, after a sync, codex's tokens
    expect(statSync(w.ccrDb).mode & 0o777).toBe(0o600);
    expect(ccrCalls(w).map((c) => c.split(" ")[0])).toEqual(["start", "stop"]);
    expect(ccrCalls(w)[0]).not.toContain(`HOME=${w.env.HOME}`);
    expect(readdirSync(w.stateDir).filter((f) => f.startsWith("bootstrap-"))).toEqual([]);
    expect(r.steps.find((s) => s.name === "codex-api provider")?.status).toBe("missing-prereq");
  });
});

describe("a CCR config that does not parse", () => {
  function corrupt() {
    const w = makeWorld({ settings: {} });
    const db = new Database(w.ccrDb);
    db.run("UPDATE app_config SET value_json = '{ broken'");
    db.close();
    return w;
  }

  test("status answers differs or absent, never throws", () => {
    const w = corrupt();
    expect(["differs", "absent"]).toContain(activation.status(w.env));
  });

  test("activate answers an error step naming the file, with no parser message, and leaves CCR's config and codex's untouched", async () => {
    const w = corrupt();
    const before = [bytes(w.ccrDb), bytes(toml(w))];
    const r = await run(w);
    expect(r.status).toBe("error");
    const failed = r.steps.filter((s) => s.status === "error");
    expect(failed.length).toBeGreaterThan(0);
    for (const step of failed) {
      expect(step.detail).toContain(w.ccrDb);
      expect(step.detail).not.toContain("JSON");
    }
    expect([bytes(w.ccrDb), bytes(toml(w))]).toEqual(before);
  });
});
