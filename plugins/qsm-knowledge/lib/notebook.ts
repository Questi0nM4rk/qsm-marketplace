// Where the notebook binary is, and whether it answers.

import { join } from "node:path";

export const NOTEBOOK_BIN = "nlm";

/** Upstream's own installer for its toolchain. */
export const NOTEBOOK_INSTALL_COMMAND = "go install github.com/tmc/nlm/cmd/nlm@latest";

export interface NotebookProbe {
  /** `command -v nlm` answered. */
  readonly onPath: boolean;
  /** `nlm --help` exited zero. */
  readonly answersHelp: boolean;
}

export interface DoctorReport {
  readonly bin: string;
  readonly ok: boolean;
  readonly findings: readonly string[];
}

/** Success only when both checks passed, and a named finding otherwise. */
export function doctorReport(probe: NotebookProbe): DoctorReport {
  const findings: string[] = [];
  if (probe.onPath) {
    if (!probe.answersHelp) {
      findings.push(`${NOTEBOOK_BIN} is on PATH but \`${NOTEBOOK_BIN} --help\` did not answer`);
    }
  } else {
    findings.push(
      `${NOTEBOOK_BIN} is not on PATH: run \`${NOTEBOOK_INSTALL_COMMAND}\`, then run this plugin's installer again to link it`,
    );
  }
  return { bin: NOTEBOOK_BIN, ok: findings.length === 0, findings };
}

/**
 * Where a Go install leaves the notebook binary: `$GOBIN`, else the first entry of `$GOPATH`, else
 * `~/go`.
 */
export function goBinPath(env: Record<string, string | undefined>, home: string): string {
  const gobin = env.GOBIN;
  if (gobin !== undefined && gobin.length > 0) {
    return join(gobin, NOTEBOOK_BIN);
  }
  const first = (env.GOPATH ?? "").split(":")[0] ?? "";
  return join(first.length > 0 ? first : join(home, "go"), "bin", NOTEBOOK_BIN);
}
