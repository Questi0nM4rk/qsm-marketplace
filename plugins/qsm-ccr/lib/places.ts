// Where qsm-ccr finds the three foreign homes, the tools it runs, and keeps its own state. Every
// path bends to the environment so a test never touches the person's files.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { RequiredTool } from "../../../lib/outcome.ts";
import { claudeDir, type Env, home, stateHome } from "../../../lib/paths.ts";

/** The upstream tools qsm-ccr runs, each with its install: install probes them, doctor reports
 * them, and a step that runs one names the same install. */
export const UPSTREAM: readonly RequiredTool[] = [
  {
    cmd: "claude",
    hint: "install Claude Code: https://docs.anthropic.com/en/docs/claude-code/setup",
  },
  { cmd: "ccr", hint: "bun add -g @musistudio/claude-code-router" },
  { cmd: "codex", hint: "bun add -g @openai/codex, then codex login" },
];

/** The reason a run of `cmd` cannot start, with its install. */
export function notOnPath(cmd: string): string {
  const hint = UPSTREAM.find((t) => t.cmd === cmd)?.hint;
  return hint === undefined ? `${cmd} is not on PATH` : `${cmd} is not on PATH: ${hint}`;
}

/** One line added to a log in the state directory: private, the directory made when absent. */
export function appendStateLine(stateDir: string, file: string, line: string): void {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  appendFileSync(join(stateDir, file), `${line}\n`, { mode: 0o600 });
}

export interface Places {
  readonly home: string;
  /** settings.json in Claude Code's home */
  readonly userSettings: string;
  /** CCR_INTERNAL_HOME_DIR, else ~/.claude-code-router */
  readonly ccrHome: string;
  readonly ccrDb: string;
  /** CODEX_HOME, else ~/.codex */
  readonly codexHome: string;
  /** qsm-ccr in the XDG state home */
  readonly stateDir: string;
}

export function placesOf(env: Env): Places {
  const h = home(env);
  const ccrHome = env.CCR_INTERNAL_HOME_DIR ?? join(h, ".claude-code-router");
  return {
    home: h,
    userSettings: join(claudeDir(env), "settings.json"),
    ccrHome,
    ccrDb: join(ccrHome, "config.sqlite"),
    codexHome: env.CODEX_HOME ?? join(h, ".codex"),
    stateDir: join(stateHome(env), "qsm-ccr"),
  };
}
