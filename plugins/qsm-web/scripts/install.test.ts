// The wiring test: it installs into a sandbox and then runs the bin that
// came out of it. The unit tests prove the functions; this one proves the
// artifact, because a compiled bin carries none of the plugin's files and
// reaches them only through QSM_MARKETPLACE.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { isolatedEnv } from "../../../lib/fixtures/cli.ts";
import { fakeInstall } from "../../../lib/fixtures/install.ts";
import { isFailure } from "../../../lib/install-contract.ts";
import { TAVILY_SKILLS } from "../lib/upstream.ts";
import { install } from "./install.ts";

const COMPILE_MS = 240_000;
const PLUGIN = resolve(import.meta.dir, "..");
function writeSkill(home: string, name: string): void {
  mkdirSync(join(home, ".claude", "skills", name), { recursive: true });
  writeFileSync(join(home, ".claude", "skills", name, "SKILL.md"), `# ${name}\n`);
}

/** Everything on this machine answers, so the installer has nothing to suggest and its status
 * reports only what it did. The external commands are stubbed at the process boundary: `npx skills
 * add` writes the skill directories the real one would, and Context7's skill, which only a person's
 * `ctx7 setup` writes, is already there. */
function machine() {
  let home = "";
  const fx = fakeInstall({
    present: () => true,
    env: { QSM_SEARXNG_INSTANCE: "https://search.test" },
    exit: (cmd) => {
      if (cmd === "npx") {
        for (const name of TAVILY_SKILLS) {
          writeSkill(home, name);
        }
      }
      return 0;
    },
  });
  home = fx.home;
  writeSkill(home, "find-docs");
  return { ctx: fx.ctx, home, bin: join(home, "bin") };
}

/** Commands the compiled doctor finds on PATH: the sandbox installed neither. */
function stubUpstreamBins(bin: string): void {
  for (const name of ["tvly", "shot-scraper"]) {
    writeFileSync(join(bin, name), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, name), 0o755);
  }
}

describe("install", () => {
  test(
    "Fresh install",
    async () => {
      const { ctx, home, bin } = machine();
      const first = await install(ctx);
      expect(first.status).toBe("installed");
      expect(existsSync(join(bin, "qsm-web"))).toBe(true);
      stubUpstreamBins(bin);

      const env = isolatedEnv(home, {
        QSM_MARKETPLACE: resolve(PLUGIN, "..", ".."),
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      });
      const doctor = spawnSync(join(bin, "qsm-web"), ["doctor", "--json"], {
        encoding: "utf8",
        env,
      });
      const envelope = z
        .object({ code: z.string(), message: z.string() })
        .parse(JSON.parse(doctor.stdout));
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
      const { ctx: base, home } = machine();
      const ctx = { ...base, run: (): number => 0 };
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
      const { ctx } = machine();
      expect((await install(ctx)).status).toBe("installed");
      const second = await install(ctx);
      expect(second.status).toBe("already");
      expect(second.detail).toContain("unchanged");
    },
    COMPILE_MS,
  );

  test("a dry run writes nothing and names what it would do", async () => {
    const { ctx, bin } = machine();
    const result = await install({ ...ctx, dryRun: true });
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
      const { ctx, bin } = machine();
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
      const { ctx } = machine();
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
      const { ctx } = machine();
      const result = await install({
        ...ctx,
        dryRun: false,
        env: {
          ...ctx.env,
          QSM_SEARXNG_INSTANCE: "",
        },
      });
      const tier = (result.steps ?? []).find((s) => s.name === "web tier");
      expect(tier?.detail).toContain("QSM_SEARXNG_INSTANCE");
    },
    COMPILE_MS,
  );
});
