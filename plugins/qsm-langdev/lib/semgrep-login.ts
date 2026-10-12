// Whether the semgrep CLI is logged in.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { SemgrepEngine } from "./registry.ts";

export type SemgrepLogin = "logged-in" | "logged-out" | "rejected" | "unknown";

/** Runs a command, returns its exit code (null when it gave none: it could
 * not start, it timed out, a signal ended it) and its stdout and stderr. */
export type RunExit = (
  cmd: string,
  args: readonly string[],
) => { status: number | null; output: string };

const PROBE_TIMEOUT_MS = 10_000;

const runExit: RunExit = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: PROBE_TIMEOUT_MS });
  return { status: r.status, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};

export function semgrepLogin(
  env: Record<string, string | undefined> = process.env,
  run: RunExit = runExit,
): SemgrepLogin {
  if ((env.SEMGREP_APP_TOKEN ?? "") !== "") {
    return "logged-in";
  }
  const { status, output } = run("semgrep", ["show", "identity"]);
  if (status === 0) {
    return "logged-in";
  }
  if (status !== 2) {
    return "unknown";
  }
  return /\b401\b/.test(output) ? "rejected" : "logged-out";
}

/** Whether the Pro engine binary is on this machine: `semgrep install-semgrep-pro`
 * puts it beside semgrep-core, and `semgrep --dump-engine-path --pro` names
 * that path whether or not a file is there (checked on 1.153.1, logged out). */
export type ProEngine = "installed" | "missing" | "unknown";

/** Runs a command, returns its exit code (null when it gave none) and stdout. */
export type RunOutput = (
  cmd: string,
  args: readonly string[],
) => { status: number | null; stdout: string };

const runOutput: RunOutput = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: PROBE_TIMEOUT_MS });
  return { status: r.status, stdout: r.stdout ?? "" };
};

export function semgrepProEngine(run: RunOutput = runOutput): ProEngine {
  const { status, stdout } = run("semgrep", ["--dump-engine-path", "--pro"]);
  const path = stdout.trim().split("\n").at(-1) ?? "";
  if (status !== 0 || path === "") {
    return "unknown";
  }
  return existsSync(path) ? "installed" : "missing";
}

/**
 * The engine a run's semgrep checkers use, and the one warning the run prints when a login did not
 * get the Pro engine.
 */
export function semgrepEngine(
  login: SemgrepLogin,
  proEngine: () => ProEngine = semgrepProEngine,
): { engine: SemgrepEngine; warning?: string } {
  if (login !== "logged-in") {
    return { engine: "community" };
  }
  const state = proEngine();
  if (state === "installed") {
    return { engine: "pro" };
  }
  const warning =
    state === "missing"
      ? "semgrep Pro engine is not installed: run semgrep install-semgrep-pro"
      : "semgrep Pro engine state is unknown: semgrep --dump-engine-path --pro named no path; the community engine ran";
  return { engine: "community", warning };
}

/** The warning doctor and install report, or null when there is none. */
export function semgrepLoginWarning(state: SemgrepLogin): string | null {
  if (state === "logged-out") {
    return "semgrep is not logged in: run semgrep login to use qsm-langdev at its fullest";
  }
  if (state === "rejected") {
    return "semgrep's login is rejected by semgrep.dev (401): run semgrep login again to use qsm-langdev at its fullest";
  }
  if (state === "unknown") {
    return "semgrep login state is unknown: semgrep show identity answered neither logged in (exit 0) nor logged out (exit 2); run it to see why";
  }
  return null;
}
