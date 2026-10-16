#!/usr/bin/env bun
// The shared install base compiles the binary qsm.json declares onto the user's PATH and writes
// its completion, and installs the command output filter it runs.

import { installScript } from "../../../lib/install-base.ts";
import { filterBin } from "../lib/doctor.ts";
import { FILTER_INSTALL_COMMAND } from "../lib/filter.ts";

export const install = installScript(import.meta, {
  upstream: [
    {
      cmd: filterBin,
      install: FILTER_INSTALL_COMMAND.split(" "),
      hint: FILTER_INSTALL_COMMAND,
    },
  ],
});
