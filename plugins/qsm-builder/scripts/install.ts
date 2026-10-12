#!/usr/bin/env bun
// The shared install base does all of it: it compiles the `qsm-builder` binary qsm.json declares
// into the user's bin directory and writes the fish completion.

import { installScript } from "../../../lib/install-base.ts";

export const install = installScript(import.meta);
