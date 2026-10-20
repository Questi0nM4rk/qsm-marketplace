#!/usr/bin/env bun

// qsm-worktrunk: the one question the hooks module cannot ask in its sandbox, which branches are
// ahead of the working branch.

import { runCli } from "../../../lib/cli-base.ts";
import { checkTools, doctorVerdict, ok } from "../../../lib/outcome.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import { branchesAhead } from "../lib/ahead.ts";
import { INSTALL_HINT } from "../lib/doctor.ts";
import manifestJson from "../qsm.json" with { type: "json" };

const manifest = parseManifest(manifestJson, "qsm-worktrunk/qsm.json");

if (import.meta.main) {
  process.exit(
    await runCli(manifest, "qsm-worktrunk", {
      doctor: () =>
        doctorVerdict(
          "qsm-worktrunk",
          checkTools([
            { cmd: "wt", hint: INSTALL_HINT },
            { cmd: "git", hint: "install git" },
          ]),
        ),
      ahead: () => {
        const names = branchesAhead(process.cwd());
        return ok(names, names.join("\n"));
      },
    }),
  );
}
