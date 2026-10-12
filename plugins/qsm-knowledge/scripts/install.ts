#!/usr/bin/env bun
// The shared install base compiles this plugin's binary and writes its completion, and builds the
// notebook binary with its upstream installer (`go install`) when it is missing.

import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { installScript } from "../../../lib/install-base.ts";
import type { InstallContext, Step } from "../../../lib/install-contract.ts";
import { binDir, home } from "../../../lib/paths.ts";
import { goBinPath, NOTEBOOK_BIN, NOTEBOOK_INSTALL_COMMAND } from "../lib/notebook.ts";

/** Link the notebook binary the upstream step built. Run after that step,
 * so a binary still missing here means the build did not produce one. */
export function notebook(ctx: InstallContext): Step {
  const name = `notebook ${NOTEBOOK_BIN}`;
  if (ctx.probe(NOTEBOOK_BIN)) {
    return { name, status: "already", detail: `${NOTEBOOK_BIN} on PATH` };
  }
  const source = goBinPath(ctx.env, home(ctx.env));
  const target = join(binDir(ctx.env), NOTEBOOK_BIN);
  if (ctx.dryRun) {
    return { name, status: "skipped", detail: `would link ${source} to ${target}` };
  }
  if (!existsSync(source)) {
    return {
      name,
      status: "error",
      detail: `${source} is not there after \`${NOTEBOOK_INSTALL_COMMAND}\`; run it yourself, then run this installer again`,
    };
  }
  mkdirSync(binDir(ctx.env), { recursive: true });
  // lstat, not exists: a dangling link from an earlier install is still there
  if (lstatSync(target, { throwIfNoEntry: false }) !== undefined) {
    unlinkSync(target);
  }
  symlinkSync(source, target);
  return { name, status: "installed", detail: `linked ${source} to ${target}` };
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
