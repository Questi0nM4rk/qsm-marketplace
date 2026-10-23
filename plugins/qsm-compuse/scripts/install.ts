#!/usr/bin/env bun
// The shared install base installs the helper links declared in qsm.json.
import { installScript } from "../../../lib/install-base.ts";

export const install = installScript(import.meta);
