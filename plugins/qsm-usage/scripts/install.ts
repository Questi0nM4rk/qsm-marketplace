#!/usr/bin/env bun
// The shared install base compiles the binary qsm.json declares onto the user's PATH and writes
// its completion, and installs the command output filter it runs.

import { installScript } from "../../../lib/install-base.ts";
import { DEFAULT_FILTER_BIN, FILTER_BIN_ENV, filterBin } from "../lib/doctor.ts";
import { FILTER_INSTALL_COMMAND } from "../lib/filter.ts";

export const install = installScript(import.meta, {
  upstream: [
    (env) => {
      const cmd = filterBin(env);
      // we build only the filter we pin; one the environment names is the user's to install
      return cmd === DEFAULT_FILTER_BIN
        ? { cmd, install: FILTER_INSTALL_COMMAND.split(" "), hint: FILTER_INSTALL_COMMAND }
        : { cmd, hint: `install ${cmd} yourself (named by ${FILTER_BIN_ENV})`, optional: true };
    },
  ],
});
