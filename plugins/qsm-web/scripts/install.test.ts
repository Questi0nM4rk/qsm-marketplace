// The wiring test: it installs into a sandbox and then runs the bin that
// came out of it. The unit tests prove the functions; this one proves the
// artifact, because a compiled bin carries none of the plugin's files and
// reaches them only through QSM_MARKETPLACE.
import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type InstallContext, isFailure } from "../../../lib/install-contract.ts";
import { TAVILY_SKILLS } from "../lib/upstream.ts";
import { install } from "./install.ts";

const COMPILE_MS = 240_000;
const PLUGIN = resolve(import.meta.dir, "..");
const sandboxes: string[] = [];

function sandbox(): { home: string; bin: string } {
  const home = mkdtempSync(join(tmpdir(), "qsm-web-install-"));
  sandboxes.push(home);
  return { home, bin: join(home, "bin") };
}

function writeSkill(home: string, name: string): void {
  mkdirSync(join(home, ".claude", "skills", name), { recursive: true });
  writeFileSync(join(home, ".claude", "skills", name, "SKILL.md"), `# ${name}\n`);
}

/** Everything on this machine answers, so the installer has nothing to suggest and its status
 * reports only what it did. The external commands are stubbed at the process boundary: `npx skills
 * add` writes the skill directories the real one would, and Context7's skill, which only a person's
 * `ctx7 setup` writes, is already there. */
function context(home: string, bin: string): InstallContext {
  writeSkill(home, "find-docs");
  return {
    dryRun: false,
    env: {
      HOME: home,
      XDG_CONFIG_HOME: join(home, "c"),
      QSM_BIN_DIR: bin,
      QSM_SEARXNG_INSTANCE: "https://search.test",
    },
    probe: () => true,
    run: (cmd) => {
      if (cmd === "npx") {
        for (const name of TAVILY_SKILLS) {
          writeSkill(home, name);
        }
      }
      return 0;
    },
  };
}

/** Commands the compiled doctor finds on PATH: the sandbox installed neither. */
function stubUpstreamBins(bin: string): void {
  for (const name of ["tvly", "shot-scraper"]) {
    writeFileSync(join(bin, name), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, name), 0o755);
  }
}

afterAll(() => {
  while (sandboxes.length > 0) {
    rmSync(sandboxes.pop() ?? "", { recursive: true, force: true });
  }
});

describe("install", () => {
  test(
    "Fresh install",
    async () => {
      const { home, bin } = sandbox();
      const ctx = context(home, bin);
      const first = await install(ctx);
      expect(first.status).toBe("installed");
      expect(existsSync(join(bin, "qsm-web"))).toBe(true);
      stubUpstreamBins(bin);

      const env = { ...process.env, QSM_MARKETPLACE: resolve(PLUGIN, "..", "..") } as Record<
        string,
        string
      >;
      env.PATH = `${bin}:${process.env.PATH ?? ""}`;
      env.HOME = home;
      env.XDG_CONFIG_HOME = join(home, "c");
      const doctor = spawnSync(join(bin, "qsm-web"), ["doctor", "--json"], {
        encoding: "utf8",
        env,
      });
      const envelope = JSON.parse(doctor.stdout) as {
        code: string;
        message: string;
      };
      expect(envelope.message).toContain("tavily skills: healthy");
      expect(envelope.message).toContain("context7 skill: healthy");
      expect(envelope.code).toBe("ok");
      expect(doctor.status).toBe(0);
    },
    COMPILE_MS,
  );
});

describe("install in other states", () => {
  test(
    "a bare home is told the person steps and gets the Tavily skills",
    async () => {
      const { home, bin } = sandbox();
      const ctx = { ...context(home, bin), run: (): number => 0 };
      rmSync(join(home, ".claude"), { recursive: true });
      const result = await install(ctx);
      const step = (name: string) => (result.steps ?? []).find((s) => s.name === name);
      // the stubbed npx wrote nothing, so a zero exit with no skill behind it is an error
      expect(step("tavily skills")?.status).toBe("error");
      expect(step("context7 skill")?.detail).toContain("npx ctx7 setup --claude");
      // the stub answers `qsm-secrets has` with zero: stored
      expect(step("tavily key")?.status).toBe("already");
    },
    COMPILE_MS,
  );

  test(
    "a second run into the same directory compiles nothing and says so",
    async () => {
      const { home, bin } = sandbox();
      expect((await install(context(home, bin))).status).toBe("installed");
      const second = await install(context(home, bin));
      expect(second.status).toBe("already");
      expect(second.detail).toContain("unchanged");
    },
    COMPILE_MS,
  );

  test("a dry run writes nothing and names what it would do", async () => {
    const { home, bin } = sandbox();
    const result = await install({ ...context(home, bin), dryRun: true });
    expect(result.status).toBe("skipped");
    expect(result.detail).toContain("scripts/cli.ts");
    expect(result.detail).toContain("shot-scraper");
    expect(result.detail).toContain("browser download");
    expect(result.detail).toContain("npx -y skills add tavily-ai/skills");
    expect(existsSync(bin)).toBe(false);
  });
});

describe("install on a machine missing a tool", () => {
  test(
    "No container runtime",
    async () => {
      const { home, bin } = sandbox();
      const ctx = context(home, bin);
      const result = await install({
        ...ctx,
        probe: (cmd) => cmd !== "docker" && cmd !== "podman",
      });
      const tier = (result.steps ?? []).find((s) => s.name === "web tier");
      expect(tier?.status).toBe("suggested");
      expect(tier?.detail).toContain("docker");
      expect(tier?.detail).toContain("podman");
      // Only the browser rung needs a runtime, and browserbox builds its
      // image on first use, so the plugin is installed, not failed: the
      // aggregate installer counts missing-prereq as a failed plugin and
      // blocks anything that requires this one behind it.
      expect(isFailure(result.status)).toBe(false);
      expect(existsSync(join(bin, "qsm-web"))).toBe(true);
    },
    COMPILE_MS,
  );
});

describe("install without uv or a download", () => {
  test(
    "a machine with no uv reports the suggestion, and the install still succeeds",
    async () => {
      const { home, bin } = sandbox();
      const ctx = context(home, bin);
      const result = await install({
        ...ctx,
        probe: (cmd) => cmd !== "shot-scraper",
        run: (cmd, args) => (cmd === "uv" ? 1 : ctx.run(cmd, args)),
      });
      const tier = (result.steps ?? []).find((s) => s.name === "upstream shot-scraper");
      expect(tier?.status).toBe("suggested");
      expect(tier?.detail).toContain("uv");
      expect(isFailure(result.status)).toBe(false);
      const webTier = (result.steps ?? []).find((s) => s.name === "web tier");
      expect(webTier?.detail).toContain("browser download skipped");
    },
    COMPILE_MS,
  );

  test(
    "a machine with no search instance is told how to make one",
    async () => {
      const { home, bin } = sandbox();
      const ctx = context(home, bin);
      const result = await install({
        ...ctx,
        dryRun: false,
        env: {
          ...ctx.env,
          QSM_SEARXNG_INSTANCE: "",
          QSM_SEARXNG_CONFIG: "/nonexistent/config.json",
        },
      });
      const tier = (result.steps ?? []).find((s) => s.name === "web tier");
      expect(tier?.detail).toContain("qsm-web searxng setup");
    },
    COMPILE_MS,
  );
});
