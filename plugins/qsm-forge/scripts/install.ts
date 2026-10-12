#!/usr/bin/env bun
// The shared install base compiles this plugin's one binary, qsm-forge, into the user's bin
// directory and writes the completion.
import { installScript } from "../../../lib/install-base.ts";
import type { Step } from "../../../lib/install-contract.ts";
import { UPSTREAM } from "../lib/doctor.ts";

const FORGES = [
  { cli: "gh", group: "gh" },
  { cli: "glab", group: "gl" },
];

export const install = installScript(import.meta, {
  // the same rows doctor checks: one list, so install and doctor agree
  upstream: UPSTREAM,
  extra: (ctx): Step => {
    const name = "a forge CLI";
    if (ctx.dryRun) {
      return { name, status: "skipped", detail: "would check that gh or glab is on PATH" };
    }
    const present = FORGES.filter((forge) => ctx.probe(forge.cli));
    if (present.length === 0) {
      return {
        name,
        status: "missing-prereq",
        detail:
          "neither gh nor glab is on PATH; install the forge CLI you use and authenticate it, then run this again",
      };
    }
    return {
      name,
      status: "already",
      detail: present.map((forge) => `qsm-forge ${forge.group} can use ${forge.cli}`).join(", "),
    };
  },
});
