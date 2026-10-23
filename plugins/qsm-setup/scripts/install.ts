#!/usr/bin/env bun
// qsm-setup installs itself the way every plugin does: the shared install base compiles its binary
// into the user's bin directory and writes its completion.
import { installScript } from "../../../lib/install-base.ts";
import { resolve } from "node:path";
import { discoverPlugins } from "../lib/discover.ts";

// Bootstrap must reject invalid ownership before even the shared installer's farm cleanup.
discoverPlugins(resolve(import.meta.dir, "../../.."));
export const install = installScript(import.meta);
