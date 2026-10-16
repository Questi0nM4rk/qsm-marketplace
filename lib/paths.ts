// Where qsm puts things on a machine. Every path bends to the environment so
// tests and unusual homes never touch real state.
import { homedir } from "node:os";
import { join } from "node:path";

export type Env = Readonly<Record<string, string | undefined>>;

export function home(env: Env): string {
  return env.HOME ?? homedir();
}

/** A variable's value, with an empty one counted as unset. */
function nonEmpty(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}

/** Claude Code's home: a non-empty `CLAUDE_CONFIG_DIR`, else `~/.claude`. */
export function claudeDir(env: Env): string {
  return nonEmpty(env.CLAUDE_CONFIG_DIR) ?? join(home(env), ".claude");
}

/** Claude Code's global config, read as join(CLAUDE_CONFIG_DIR || homedir(), ".claude.json"):
 * any non-empty `CLAUDE_CONFIG_DIR`, `~/.claude` included, moves it out of the home directory. */
export function claudeJsonPath(env: Env): string {
  return join(nonEmpty(env.CLAUDE_CONFIG_DIR) ?? home(env), ".claude.json");
}

/** Compiled binaries land here; `QSM_BIN_DIR` overrides. */
export function binDir(env: Env): string {
  return env.QSM_BIN_DIR ?? join(home(env), ".local", "bin");
}

/** The XDG config home: `XDG_CONFIG_HOME`, else `~/.config`. */
export function configDir(env: Env): string {
  return env.XDG_CONFIG_HOME ?? join(home(env), ".config");
}

/** The login session's private tmpfs, or undefined when no session set `XDG_RUNTIME_DIR`. */
export function runtimeDir(env: Env): string | undefined {
  return nonEmpty(env.XDG_RUNTIME_DIR);
}

export function fishCompletionDir(env: Env): string {
  return join(configDir(env), "fish", "completions");
}

/** The machine's setup.json: qsm-setup's settings and the choices an activation stored. */
export function setupConfigPath(env: Env): string {
  if (env.QSM_SETUP_CONFIG !== undefined) {
    return env.QSM_SETUP_CONFIG;
  }
  return join(configDir(env), "qsm", "setup.json");
}

/** The XDG data home: `XDG_DATA_HOME`, else `~/.local/share`. */
export function dataDir(env: Env): string {
  return env.XDG_DATA_HOME ?? join(home(env), ".local", "share");
}

/** Where qsm keeps machine state; `QSM_SETUP_STATE_DIR` overrides. */
export function stateDir(env: Env): string {
  const base = env.XDG_STATE_HOME ?? join(home(env), ".local", "state");
  return env.QSM_SETUP_STATE_DIR ?? join(base, "qsm");
}

/** What the bin farm last compiled: each binary's plugin and hash. */
export function buildRecordPath(env: Env): string {
  return join(stateDir(env), "bins.json");
}

/** The machine-local gitleaks rules for names that must never be committed to a public repo;
 * generated per device by the content-denylist skill and never committed. */
export function contentDenylistPath(env: Env): string {
  return join(configDir(env), "qsm", "content-denylist.toml");
}
