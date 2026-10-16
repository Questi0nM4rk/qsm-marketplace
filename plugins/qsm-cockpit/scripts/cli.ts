#!/usr/bin/env bun

// qsm-cockpit: the one question the hooks module cannot ask in its sandbox, which tasks the
// tracker holds in progress here.

import { runCli } from "../../../lib/cli-base.ts";
import { checkTools, doctorVerdict, ok } from "../../../lib/outcome.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import { inProgress } from "../lib/tasks.ts";
import manifestJson from "../qsm.json" with { type: "json" };

const manifest = parseManifest(manifestJson, "qsm-cockpit/qsm.json");

if (import.meta.main) {
  process.exit(
    await runCli(manifest, "qsm-cockpit", {
      doctor: () =>
        doctorVerdict("qsm-cockpit", checkTools([{ cmd: "br", hint: "install qsm-tasks" }])),
      tasks: () => {
        const list = inProgress();
        return ok(list, list.map((task) => `${task.id} ${task.title}`).join("\n"));
      },
    }),
  );
}
