#!/usr/bin/env bun
// qsm-tasks ships no binary and writes no file: its skill is loaded by the harness from the
// plugin, so the shared install base only probes br, which no command can install unattended.

import { installScript } from "../../../lib/install-base.ts";

export const install = installScript(import.meta, {
  upstream: [
    {
      cmd: "br",
      hint: "curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/beads_rust/main/install.sh | bash",
    },
  ],
});
