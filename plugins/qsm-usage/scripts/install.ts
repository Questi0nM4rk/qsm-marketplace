#!/usr/bin/env bun
// The shared install base compiles the binary qsm.json declares onto the user's PATH and writes
// its completion.

import { installScript } from "../../../lib/install-base.ts";
import type { InstallContext, Step } from "../../../lib/install-contract.ts";
import { DEFAULT_FILTER_BIN, FILTER_BIN_ENV, filterBin } from "../lib/doctor.ts";
import { FILTER_INSTALL_COMMAND, FILTER_TOOLCHAIN } from "../lib/filter.ts";

export function filterStep(ctx: InstallContext): Step {
  const name = "command output filter";
  const bin = filterBin(ctx.env);
  if (ctx.probe(bin)) {
    return { name, status: "already", detail: `${bin} on PATH` };
  }
  if (bin !== DEFAULT_FILTER_BIN) {
    const detail = `${bin} (named by ${FILTER_BIN_ENV}) is not on PATH; install it yourself`;
    return { name, status: "suggested", detail: ctx.dryRun ? `would need ${bin}` : detail };
  }
  if (ctx.dryRun) {
    return { name, status: "skipped", detail: `would run ${FILTER_INSTALL_COMMAND}` };
  }
  const [cmd = FILTER_TOOLCHAIN, ...args] = FILTER_INSTALL_COMMAND.split(" ");
  const exit = ctx.run(cmd, args);
  return exit === 0
    ? { name, status: "installed", detail: `ran ${FILTER_INSTALL_COMMAND}` }
    : {
        name,
        status: "error",
        detail: `${FILTER_INSTALL_COMMAND} exited ${exit}; run it yourself`,
      };
}

export const install = installScript(import.meta, {
  extra: filterStep,
});
