// gh and glab are alternatives: `qsm-forge gh` needs one, `qsm-forge gl` the other, and a person
// uses the forge they work on. One row names both, so install and doctor report one `missing`.
import type { UpstreamTool } from "../../../lib/install-base.ts";
import {
  type DoctorData,
  doctorVerdict,
  type OnPath,
  type Outcome,
  onPath,
} from "../../../lib/outcome.ts";

const FORGE_CLIS = ["gh", "glab"];

export const UPSTREAM: UpstreamTool = {
  cmd: "gh or glab",
  anyOf: FORGE_CLIS,
  hint: "install the GitHub CLI and run gh auth login, or the GitLab CLI and run glab auth login",
};

export function forgeDoctor(probe: OnPath = onPath): Outcome<DoctorData> {
  return doctorVerdict("qsm-forge", [
    {
      cmd: "gh or glab",
      present: FORGE_CLIS.some(probe),
      optional: false,
      hint: UPSTREAM.hint,
    },
  ]);
}
