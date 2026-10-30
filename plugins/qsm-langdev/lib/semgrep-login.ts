// Whether the semgrep CLI is logged in.

import { spawnSync } from "node:child_process";

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
