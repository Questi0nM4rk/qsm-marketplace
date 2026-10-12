#!/usr/bin/env bun
// The shared install base compiles both binaries into the user's bin directory and writes their
// completions; this plugin adds the graphify version gate.

import { spawnSync } from "node:child_process";
import { installScript } from "../../../lib/install-base.ts";
import type { InstallContext, Step } from "../../../lib/install-contract.ts";
import { GRAPHIFY, graphifyNewEnough, SEMBLE } from "../lib/doctor.ts";

const UPGRADE = ["uv", "tool", "install", "-U", "graphifyy"] as const;
const UPGRADE_COMMAND = GRAPHIFY.install;

/** What `graphify --version` prints, empty when graphify is absent. */
function installedGraphify(): string {
  const r = spawnSync(GRAPHIFY.bin, ["--version"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
}

/** graphify at `GRAPHIFY.minVersion` or newer: already, else `uv tool install -U`. `version`
 * is the probe; a test hands in its own. */
export function graphifyStep(ctx: InstallContext, version: () => string = installedGraphify): Step {
  const name = "graphify";
  const have = version();
  if (graphifyNewEnough(have)) {
    return { name, status: "already", detail: `${have} is ${GRAPHIFY.minVersion} or newer` };
  }
  if (ctx.dryRun) {
    return { name, status: "skipped", detail: `would run ${UPGRADE_COMMAND}` };
  }
  const exit = ctx.run(UPGRADE[0], UPGRADE.slice(1));
  return exit === 0
    ? { name, status: "installed", detail: `ran ${UPGRADE_COMMAND}` }
    : { name, status: "error", detail: `${UPGRADE_COMMAND} exited ${exit}; run it yourself` };
}

export const install = installScript(import.meta, {
  upstream: [
    {
      cmd: SEMBLE.bin,
      hint: `for ${SEMBLE.provides} run: ${SEMBLE.install}`,
      optional: true as const,
    },
  ],
  extra: (ctx) => graphifyStep(ctx),
});
