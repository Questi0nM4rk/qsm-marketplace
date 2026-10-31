#!/usr/bin/env bun
// The shared install base compiles the three classic hooks hooks.json declares and the qsm-worktrunk
// bin into dist/, and links the bin onto PATH: the function-hooks module and the skill load from
// the plugin itself, and no hook calls the bin.

import { installScript } from "../../../lib/install-base.ts";
import { INSTALL_HINT } from "../lib/doctor.ts";

export const install = installScript(import.meta, {
  upstream: [{ cmd: "wt", hint: INSTALL_HINT }],
});
