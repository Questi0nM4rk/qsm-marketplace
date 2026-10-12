#!/usr/bin/env bun
// The shared install base does all of it: it compiles the `qsm-memory` binary
// qsm.json declares into the user's bin directory, which the hooks module calls
// through $.memory, and writes the fish completion. There is nothing this
// plugin needs that the base cannot see.

import { installScript } from "../../../lib/install-base.ts";

export const install = installScript(import.meta);
