// gh and glab are alternatives: `qsm-forge gh` needs one, `qsm-forge gl` the other, and a person
// uses the forge they work on. One row names both, so install and doctor report one `missing`.
import type { UpstreamTool } from "../../../lib/install-base.ts";
import {
  checkTools,
  type DoctorData,
  doctorVerdict,
  type OnPath,
  type Outcome,
  onPath,
} from "../../../lib/outcome.ts";

export const UPSTREAM = {
  cmd: "gh or glab",
  anyOf: ["gh", "glab"],
  hint: "install the GitHub CLI and run gh auth login, or the GitLab CLI and run glab auth login",
} satisfies UpstreamTool;

export function forgeDoctor(probe: OnPath = onPath): Outcome<DoctorData> {
  return doctorVerdict("qsm-forge", checkTools([UPSTREAM], probe));
}
