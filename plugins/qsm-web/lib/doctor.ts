// What doctor answers: is each command the tier uses there and answering, and are the upstream
// agent skills (Tavily's, Context7's) where Claude Code reads them. A miss names the fix.
import { join } from "node:path";
import type { Env } from "../../../lib/paths.ts";
import {
  CONTEXT7_SETUP_LINE,
  claudeSkillsDir,
  hasContext7Skill,
  missingTavilySkills,
  TAVILY_SKILLS_INSTALL_LINE,
  TVLY_INSTALL_LINE,
} from "./upstream.ts";

type Health = "healthy" | "unhealthy";

export interface BinReport {
  readonly bin: string;
  readonly status: Health;
  readonly detail: string;
}

export interface SkillReport {
  readonly skill: string;
  readonly status: Health;
  readonly detail: string;
}

export interface DoctorReport {
  readonly ok: boolean;
  readonly bins: readonly BinReport[];
  readonly skills: readonly SkillReport[];
}

const BINS = ["qsm-web"] as const;

/** The automation rung's upstream CLI. */
export const SHOT_SCRAPER = "shot-scraper";
const SHOT_SCRAPER_HINT = "uv tool install shot-scraper";

/** The Tavily CLI. */
export const TVLY = "tvly";

export const NO_ROOT = "no marketplace root: set QSM_MARKETPLACE to the qsm-marketplace checkout";

/** The plugin's own directory, for the image build: a compiled bin carries none of its files, so
 * it finds them under the marketplace checkout. */
export function pluginRoot(env: Record<string, string | undefined>): string | undefined {
  const marketplace = env.QSM_MARKETPLACE;
  return marketplace === undefined || marketplace.length === 0
    ? undefined
    : join(marketplace, "plugins", "qsm-web");
}

export interface BinProbe {
  /** `command -v <bin>` */
  readonly onPath: (bin: string) => boolean;
  /** the bin's own help call; true when it exits zero */
  readonly responds: (bin: string) => boolean;
}

function checkBin(bin: string, probe: BinProbe): BinReport {
  if (!probe.onPath(bin)) {
    return { bin, status: "unhealthy", detail: "not on PATH" };
  }
  if (!probe.responds(bin)) {
    return { bin, status: "unhealthy", detail: "on PATH but its help call failed" };
  }
  return { bin, status: "healthy", detail: "on PATH and answering" };
}

/** Is `shot-scraper` present and answering. */
export function checkShotScraper(versionResponds: () => boolean): BinReport {
  if (!versionResponds()) {
    return { bin: SHOT_SCRAPER, status: "unhealthy", detail: `not on PATH: ${SHOT_SCRAPER_HINT}` };
  }
  return { bin: SHOT_SCRAPER, status: "healthy", detail: "on PATH and answering" };
}

/** Is the Tavily CLI on PATH. */
export function checkTvly(onPath: (bin: string) => boolean): BinReport {
  if (!onPath(TVLY)) {
    return { bin: TVLY, status: "unhealthy", detail: `not on PATH: ${TVLY_INSTALL_LINE}` };
  }
  return { bin: TVLY, status: "healthy", detail: "on PATH" };
}

/** Are Tavily's agent skills where Claude Code reads them. */
export function checkTavilySkills(env: Env): SkillReport {
  const skill = "tavily skills";
  const missing = missingTavilySkills(env);
  if (missing.length > 0) {
    return {
      skill,
      status: "unhealthy",
      detail: `missing ${missing.join(", ")} under ${claudeSkillsDir(env)}: ${TAVILY_SKILLS_INSTALL_LINE}`,
    };
  }
  return { skill, status: "healthy", detail: `present under ${claudeSkillsDir(env)}` };
}

/** Is the Context7 skill, which `ctx7 setup --claude` installs, where Claude Code reads it. */
export function checkContext7Skill(env: Env): SkillReport {
  const skill = "context7 skill";
  if (!hasContext7Skill(env)) {
    return {
      skill,
      status: "unhealthy",
      detail: `missing under ${claudeSkillsDir(env)}: ${CONTEXT7_SETUP_LINE}`,
    };
  }
  return { skill, status: "healthy", detail: `present under ${claudeSkillsDir(env)}` };
}

export function runDoctor(
  probe: BinProbe,
  shotScraperVersionResponds: () => boolean,
  env: Env,
): DoctorReport {
  const bins = [
    ...BINS.map((bin) => checkBin(bin, probe)),
    checkShotScraper(shotScraperVersionResponds),
    checkTvly(probe.onPath),
  ];
  const skills = [checkTavilySkills(env), checkContext7Skill(env)];
  const ok = [...bins, ...skills].every((r) => r.status === "healthy");
  return { ok, bins, skills };
}

export function formatDoctor(report: DoctorReport): string {
  const lines = [
    ...report.bins.map((b) => `${b.bin}: ${b.status} (${b.detail})`),
    ...report.skills.map((s) => `${s.skill}: ${s.status} (${s.detail})`),
  ];
  return `${lines.join("\n")}\n`;
}
