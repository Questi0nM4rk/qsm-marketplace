#!/usr/bin/env bun
// The shared install base compiles qsm-ccr into the bin directory and writes its completion. The
// three upstream tools are probed, never installed and never run: any ccr invocation can start the
// daemon before activation's guard holds.
import { installScript } from "../../../lib/install-base.ts";
import { UPSTREAM } from "../lib/places.ts";

export const install = installScript(import.meta, { upstream: UPSTREAM });
