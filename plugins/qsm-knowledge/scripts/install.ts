#!/usr/bin/env bun
// The shared install base compiles this plugin's binary and writes its completion, and builds the
// notebook binary with its upstream installer (`go install`) when it is missing.

import { existsSync } from "node:fs";
import { installScript, linkBin } from "../../../lib/install-base.ts";
import type { InstallContext, Step } from "../../../lib/install-contract.ts";
import { home } from "../../../lib/paths.ts";
import { goBinPath, NOTEBOOK_BIN, NOTEBOOK_INSTALL_COMMAND } from "../lib/notebook.ts";

/** Link the notebook binary the upstream step built. Run after that step,
 * so a binary still missing here means the build did not produce one. */
export function notebook(ctx: InstallContext): Step {
  const name = `notebook ${NOTEBOOK_BIN}`;
  if (ctx.probe(NOTEBOOK_BIN)) {
    return { name, status: "already", detail: `${NOTEBOOK_BIN} on PATH` };
  }
  const source = goBinPath(ctx.env, home(ctx.env));
  if (!ctx.dryRun && !existsSync(source)) {
    return {
      name,
      status: "error",
      detail: `${source} is not there after \`${NOTEBOOK_INSTALL_COMMAND}\`; run it yourself, then run this installer again`,
    };
  }
  return linkBin(ctx, NOTEBOOK_BIN, source);
}

export const install = installScript(import.meta, {
  upstream: [
    {
      cmd: NOTEBOOK_BIN,
      install: NOTEBOOK_INSTALL_COMMAND.split(" "),
      hint: NOTEBOOK_INSTALL_COMMAND,
    },
  ],
  extra: notebook,
});
