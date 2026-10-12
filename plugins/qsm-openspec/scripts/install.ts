#!/usr/bin/env bun
// The shared install base compiles this plugin's binary and writes its completion.

import { installScript } from "../../../lib/install-base.ts";
import { INSTALL_COMMAND, UPSTREAM_PACKAGE } from "../lib/doctor.ts";

export const install = installScript(import.meta, {
  upstream: [
    { cmd: "openspec", install: ["bun", "add", "-g", UPSTREAM_PACKAGE], hint: INSTALL_COMMAND },
  ],
});
