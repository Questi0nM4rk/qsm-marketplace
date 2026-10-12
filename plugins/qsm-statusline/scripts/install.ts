#!/usr/bin/env bun
// The shared install base compiles the renderer straight into the user's bin directory, so the
// settings entry names a binary on PATH and never a path into this checkout, and writes the fish
// completion.

import { installScript } from "../../../lib/install-base.ts";
import type { InstallContext, Step } from "../../../lib/install-contract.ts";
import { readStatusLine, STATUS_LINE_ENTRY, settingsPath } from "../lib/settings.ts";

const NAME = "statusLine entry";

export function settingsStep(ctx: InstallContext): Step {
  const settings = settingsPath(ctx.env);
  const wire = `add "statusLine": ${JSON.stringify(STATUS_LINE_ENTRY)} to ${settings}, or ask for the setup-statusline skill, then restart Claude Code`;
  if (ctx.dryRun) {
    return { name: NAME, status: "skipped", detail: `would read ${settings}` };
  }
  const state = readStatusLine(settings);
  return state.kind === "wired"
    ? { name: NAME, status: "already", detail: `${settings} already runs the renderer` }
    : { name: NAME, status: "suggested", detail: wire };
}

export const install = installScript(import.meta, {
  extra: settingsStep,
});
