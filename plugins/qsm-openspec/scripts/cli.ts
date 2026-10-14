#!/usr/bin/env bun

// qsm-openspec: the answer a skill cannot reach by reading.

import { type Call, optionalString, runCli } from "../../../lib/cli-base.ts";
import { fail, type Outcome, ok } from "../../../lib/outcome.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import {
  type DoctorSections,
  doctorSections,
  isDir,
  openspecVersion,
  repositoryRoot,
} from "../lib/doctor.ts";
import manifestJson from "../qsm.json" with { type: "json" };

const manifest = parseManifest(manifestJson);

/** doctor is `missing` when the upstream openspec CLI is not on PATH. */
function doctor(call: Call): Outcome {
  const root = optionalString(call, "root") ?? repositoryRoot(process.cwd());
  if (!isDir(root)) {
    return fail("missing", `--root ${root} is not a directory`);
  }
  const version = openspecVersion();
  const sections: DoctorSections = doctorSections({ root, version });
  const lines = Object.entries(sections).flatMap(([name, rows]) => [
    `${name}:`,
    ...rows.map((line) => `  ${line}`),
  ]);
  return version === null
    ? fail("missing", lines.join("\n"), sections)
    : ok(sections, lines.join("\n"));
}

if (import.meta.main) {
  process.exit(await runCli(manifest, "qsm-openspec", { doctor }));
}
