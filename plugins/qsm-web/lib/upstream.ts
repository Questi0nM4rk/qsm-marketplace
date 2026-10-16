// The two upstream tools qsm-web leans on and where they put their agent skills: install and doctor
// read the same commands and the same locations, so the fix doctor prints is the line install runs.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeDir, type Env } from "../../../lib/paths.ts";

/** The Tavily CLI; its installer drops the `tvly` binary. */
export const TVLY_INSTALL_LINE = "curl -fsSL https://cli.tavily.com/install.sh | bash";
export const TVLY_INSTALL = ["bash", "-c", TVLY_INSTALL_LINE];

/** Tavily's agent skills, from https://docs.tavily.com/documentation/agent-skills. */
export const TAVILY_SKILLS = [
  "tavily-search",
  "tavily-extract",
  "tavily-crawl",
  "tavily-map",
  "tavily-research",
  "tavily-best-practices",
];
/** The docs say `--all`, which is `--skill '*' --agent '*' -y`: every agent's directory, and a
 * project-level install. This is every skill, Claude Code only, user level, without a prompt. */
export const TAVILY_SKILLS_INSTALL = [
  "npx",
  "-y",
  "skills",
  "add",
  "tavily-ai/skills",
  "--skill",
  "*",
  "--agent",
  "claude-code",
  "--global",
  "--yes",
];
export const TAVILY_SKILLS_INSTALL_LINE = TAVILY_SKILLS_INSTALL.join(" ").replace("*", "'*'");

/** `ctx7 setup --claude` writes one of these under the Claude home: CLI mode `find-docs`, MCP mode
 * `context7-mcp`. It is interactive (OAuth device flow), so a person runs it. */
const CONTEXT7_SKILLS = ["find-docs", "context7-mcp"];
export const CONTEXT7_SETUP_LINE = "npx ctx7 setup --claude";

/** The key tvly reads as TAVILY_API_KEY, stored through qsm-secrets so it never enters a transcript. */
export const TAVILY_KEY = "tavily-api-key";
export const TAVILY_KEY_LINE = `qsm-secrets set ${TAVILY_KEY}, then run tvly as: qsm-secrets env ${TAVILY_KEY}=TAVILY_API_KEY -- tvly <args>`;

/** The directory Claude Code reads user-level skills from. */
export function claudeSkillsDir(env: Env): string {
  return join(claudeDir(env), "skills");
}

function hasSkill(env: Env, name: string): boolean {
  return existsSync(join(claudeSkillsDir(env), name, "SKILL.md"));
}

/** The Tavily skills that are not there. */
export function missingTavilySkills(env: Env): string[] {
  return TAVILY_SKILLS.filter((name) => !hasSkill(env, name));
}

export function hasContext7Skill(env: Env): boolean {
  return CONTEXT7_SKILLS.some((name) => hasSkill(env, name));
}
