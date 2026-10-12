#!/usr/bin/env bun
// qsm-setup installs itself the way every plugin does: the shared install base compiles its binary
// into the user's bin directory and writes its completion.
import { installScript } from "../../../lib/install-base.ts";

export const install = installScript(import.meta);
