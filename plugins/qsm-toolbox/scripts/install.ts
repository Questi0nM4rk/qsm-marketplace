#!/usr/bin/env bun
// Two things happen here, and the shared install base owns the first: this
// plugin's own binary is compiled straight into the user's bin directory and
// its completion written, so nothing is ever run through a path into this
// checkout (AGENTS.md law 9).
//
// The second is this plugin's one extra step, and the base cannot know it:
// the table. Every third-party row that is not on PATH is installed through
// its own package manager, or, where a system package manager or sudo owns
// it, reported with the exact line to type. One row's trouble stays that
// row's, so the worst row decides the step and the rest still ran.
//
// It installs no other qsm binary. Those belong to the plugins that ship
// them, and an installer that reached into a sibling would be a second
// install path.

import { installScript } from "../../../lib/install-base.ts";
import type { InstallContext, Step } from "../../../lib/install-contract.ts";
import { TOOLS } from "../lib/catalog.ts";
import { installAll, planLine, worstStatus } from "../lib/install.ts";

const NAME = "third-party tools";

export function tableStep(ctx: InstallContext): Step {
  if (ctx.dryRun) {
    return {
      name: NAME,
      status: "skipped",
      detail: `would walk the third-party tools: ${TOOLS.map((t) => planLine(t, ctx)).join("; ")}`,
    };
  }
  const outcomes = installAll(ctx);
  // A row the environment skipped is one the run did nothing to: already,
  // with the reason in its detail.
  const worst = worstStatus(outcomes);
  return {
    name: NAME,
    status: worst === "skipped" ? "already" : worst,
    detail: outcomes.map((o) => `${o.bin}: ${o.status} ${o.detail}`).join("; "),
  };
}

export const install = installScript(import.meta, {
  extra: tableStep,
});
