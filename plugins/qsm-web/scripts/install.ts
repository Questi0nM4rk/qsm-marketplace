#!/usr/bin/env bun
// The shared install base compiles the one bin and writes its completion.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { installBase } from "../../../lib/install-base.ts";
import { cliMain, type InstallContext, type Step } from "../../../lib/install-contract.ts";
import { home } from "../../../lib/paths.ts";
import {
  CONTEXT7_SETUP_LINE,
  claudeSkillsDir,
  hasContext7Skill,
  missingTavilySkills,
  TAVILY_KEY,
  TAVILY_KEY_LINE,
  TAVILY_SKILLS_INSTALL,
  TAVILY_SKILLS_INSTALL_LINE,
  TVLY_INSTALL,
  TVLY_INSTALL_LINE,
} from "../lib/upstream.ts";

const PLUGIN_ROOT = join(import.meta.dir, "..");
const RUNTIME_HINT =
  "install docker (https://docs.docker.com/engine/install) or podman (https://podman.io/docs/installation); qsm-web browserbox start builds the image on first use";

/**
 * `shot-scraper install` is idempotent upstream, so running it on every install is safe; a machine
 * that never installed `shot-scraper` itself skips the download rather than failing on a missing
 * command.
 */
function browserDownloadNote(ctx: InstallContext): string {
  if (!ctx.probe("shot-scraper")) {
    return "shot-scraper not on PATH yet: browser download skipped";
  }
  if (ctx.run("shot-scraper", ["install"]) !== 0) {
    return "shot-scraper install failed; run it yourself";
  }
  return "shot-scraper install ok (browser download)";
}

function searchConfigured(env: InstallContext["env"]): boolean {
  const instance = env.QSM_SEARXNG_INSTANCE;
  if (instance !== undefined && instance.length > 0) {
    return true;
  }
  return existsSync(env.QSM_SEARXNG_CONFIG ?? join(home(env), ".config/qsm-searxng/config.json"));
}

/** Report what the tier is still missing. */
function webTier(ctx: InstallContext): Step {
  const name = "web tier";
  const runtime = ["docker", "podman"].find((cmd) => ctx.probe(cmd));
  if (ctx.dryRun) {
    return {
      name,
      status: "skipped",
      detail: "would run shot-scraper install (browser download) if shot-scraper is on PATH",
    };
  }
  const notes = [
    runtime === undefined ? `no container runtime: ${RUNTIME_HINT}` : `${runtime} on PATH`,
    ...(searchConfigured(ctx.env)
      ? []
      : ["qsm-web searxng has no instance yet: qsm-web searxng setup"]),
    browserDownloadNote(ctx),
  ];
  const detail = notes.join("; ");
  // An absent container runtime is a suggestion, not a failed install: only the browser rung needs
  // one, the rest of qsm-web works without it, and every other unsatisfiable upstream in the
  // marketplace is `suggested` too.
  if (runtime === undefined) {
    return { name, status: "suggested", detail };
  }
  return { name, status: "already", detail };
}

/** Tavily's agent skills into the Claude home, user level. Checked again after the run: a zero exit
 * that left no skill behind is an error, not an install. */
function tavilySkills(ctx: InstallContext): Step {
  const name = "tavily skills";
  const where = claudeSkillsDir(ctx.env);
  if (missingTavilySkills(ctx.env).length === 0) {
    return { name, status: "already", detail: `present under ${where}` };
  }
  if (ctx.dryRun) {
    return { name, status: "skipped", detail: `would run ${TAVILY_SKILLS_INSTALL_LINE}` };
  }
  if (!ctx.probe("npx")) {
    return {
      name,
      status: "suggested",
      detail: `npx is not on PATH: install node, then ${TAVILY_SKILLS_INSTALL_LINE}`,
    };
  }
  const [cmd = "", ...args] = TAVILY_SKILLS_INSTALL;
  const exit = ctx.run(cmd, args);
  const left = missingTavilySkills(ctx.env);
  if (exit !== 0 || left.length > 0) {
    const why = exit === 0 ? `left ${left.join(", ")} missing under ${where}` : `exited ${exit}`;
    return {
      name,
      status: "error",
      detail: `${TAVILY_SKILLS_INSTALL_LINE} ${why}; run it yourself`,
    };
  }
  return { name, status: "installed", detail: `ran ${TAVILY_SKILLS_INSTALL_LINE}` };
}

/** What only a person can do: Context7's setup is an OAuth device flow, and the Tavily key is typed
 * into the vault's own prompt. Both are printed, never run. */
function personSteps(ctx: InstallContext): Step[] {
  const context7: Step = hasContext7Skill(ctx.env)
    ? { name: "context7 skill", status: "already", detail: "present" }
    : {
        name: "context7 skill",
        status: "suggested",
        detail: `run ${CONTEXT7_SETUP_LINE} (interactive, signs in)`,
      };
  // qsm-secrets answers has with exit 0 when the key is stored; it is a read and prints no value.
  const stored =
    !ctx.dryRun && ctx.probe("qsm-secrets") && ctx.run("qsm-secrets", ["has", TAVILY_KEY]) === 0;
  const key: Step = stored
    ? { name: "tavily key", status: "already", detail: `${TAVILY_KEY} is stored` }
    : { name: "tavily key", status: "suggested", detail: TAVILY_KEY_LINE };
  return [context7, key];
}

/** The Tavily CLI is an upstream tool above; its skills and the person steps follow the web tier. */
function tavilyTier(ctx: InstallContext): Step[] {
  return [tavilySkills(ctx), ...personSteps(ctx)];
}

export const install = installBase({
  pluginRoot: PLUGIN_ROOT,
  upstream: [
    {
      cmd: "opensrc",
      install: ["bun", "add", "-g", "opensrc"],
      hint: "qsm-web opensrc get resolves package specs with opensrc: bun add -g opensrc",
    },
    {
      cmd: "tvly",
      install: TVLY_INSTALL,
      hint: TVLY_INSTALL_LINE,
      // search and the browser rung run without Tavily; only its skills need the CLI.
      optional: true,
    },
    {
      cmd: "shot-scraper",
      install: ["uv", "tool", "install", "shot-scraper"],
      hint: "the automation rung runs shot-scraper: install uv (https://docs.astral.sh/uv/), then uv tool install shot-scraper",
      // qsm-web opensrc get runs without the automation rung; only that rung needs it.
      optional: true,
    },
  ],
  extra: (ctx) => [webTier(ctx), ...tavilyTier(ctx)],
});

if (import.meta.main) {
  process.exit(await cliMain(install));
}
