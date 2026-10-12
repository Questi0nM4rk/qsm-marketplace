#!/usr/bin/env bun
// The shared install base compiles the three classic hooks hooks.json declares into dist/, and links
// nothing else: the function-hooks module and the skill load from the plugin itself.

import { installScript } from "../../../lib/install-base.ts";
import { INSTALL_HINT } from "../lib/doctor.ts";

export const install = installScript(import.meta, {
  upstream: [{ cmd: "wt", hint: INSTALL_HINT }],
});
