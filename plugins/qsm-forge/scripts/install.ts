#!/usr/bin/env bun
// The shared install base compiles this plugin's one binary, qsm-forge, into the user's bin
// directory and writes the completion.
import { installScript } from "../../../lib/install-base.ts";
import { UPSTREAM } from "../lib/doctor.ts";

export const install = installScript(import.meta, {
  // the same row doctor checks: one list, so install and doctor agree
  upstream: [UPSTREAM],
});
