// Where qsm puts things on a machine. Every path bends to the environment so
// tests and unusual homes never touch real state.
import { homedir } from "node:os";
import { join } from "node:path";

export type Env = Readonly<Record<string, string | undefined>>;

export function home(env: Env): string {
  return env.HOME ?? homedir();
}

/** Compiled binaries land here; `QSM_BIN_DIR` overrides. */
export function binDir(env: Env): string {
  return env.QSM_BIN_DIR ?? join(home(env), ".local", "bin");
}

export function fishCompletionDir(env: Env): string {
  const base = env.XDG_CONFIG_HOME ?? join(home(env), ".config");
  return join(base, "fish", "completions");
}

/** The machine's setup.json: qsm-setup's settings and the choices an activation stored. */
export function setupConfigPath(env: Env): string {
  if (env.QSM_SETUP_CONFIG !== undefined) {
    return env.QSM_SETUP_CONFIG;
  }
  const base = env.XDG_CONFIG_HOME ?? join(home(env), ".config");
  return join(base, "qsm", "setup.json");
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
  const base = env.XDG_CONFIG_HOME ?? join(home(env), ".config");
  return join(base, "qsm", "content-denylist.toml");
}
