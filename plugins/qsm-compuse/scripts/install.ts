#!/usr/bin/env bun
// drive is a bash script, so the shared install base has nothing to compile: it only links it.
import { join } from "node:path";
import { installScript, linkBin } from "../../../lib/install-base.ts";

export const install = installScript(import.meta, {
  extra: (ctx) => linkBin(ctx, "drive", join(import.meta.dir, "drive")),
});
