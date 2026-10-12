// gh and glab are alternatives: `qsm-forge gh` needs one, `qsm-forge gl` the other, and a person
// uses the forge they work on.
import {
  checkTools,
  type DoctorData,
  doctorVerdict,
  type OnPath,
  type Outcome,
  onPath,
  type RequiredTool,
} from "../../../lib/outcome.ts";

export const UPSTREAM: readonly RequiredTool[] = [
  { cmd: "gh", hint: "install the GitHub CLI and run gh auth login", optional: true },
  { cmd: "glab", hint: "install the GitLab CLI and run glab auth login", optional: true },
];

export function forgeDoctor(probe: OnPath = onPath): Outcome<DoctorData> {
  const checks = checkTools(UPSTREAM, probe);
  const findings = checks.some((c) => c.present)
    ? []
    : [`neither gh nor glab is on PATH: ${UPSTREAM.map((t) => t.hint).join(", or ")}`];
  return doctorVerdict("qsm-forge", checks, findings);
}
