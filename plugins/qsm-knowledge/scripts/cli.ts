#!/usr/bin/env bun

// qsm-knowledge: the two checks a skill cannot answer by reading.

import { spawnSync } from "node:child_process";
import { type Call, requiredString, runCli } from "../../../lib/cli-base.ts";
import { fail, type Outcome, ok } from "../../../lib/outcome.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import { validateFile } from "../lib/note.ts";
import { doctorReport, NOTEBOOK_BIN } from "../lib/notebook.ts";
import manifestJson from "../qsm.json" with { type: "json" };

const manifest = parseManifest(manifestJson, "qsm-knowledge/qsm.json");

/** A note with an error is a check that ran and found something, so the
 * verb failed; a note with only warnings passed, and carries them. */
function validate(call: Call): Outcome {
  const report = validateFile(requiredString(call, "note"));
  const outcome = report.ok
    ? ok(report, `ok ${report.file}`)
    : fail("failed", `fail ${report.file}: ${report.errors.join("; ")}`, report);
  return { ...outcome, warnings: report.warnings };
}

/** The two live probes doctor reports on. */
function probeNotebook(): { onPath: boolean; answersHelp: boolean } {
  const onPath =
    spawnSync("command", ["-v", NOTEBOOK_BIN], { shell: true, stdio: "ignore" }).status === 0;
  if (!onPath) {
    return { onPath, answersHelp: false };
  }
  return {
    onPath,
    answersHelp: spawnSync(NOTEBOOK_BIN, ["--help"], { stdio: "ignore" }).status === 0,
  };
}

function doctor(): Outcome {
  const report = doctorReport(probeNotebook());
  return report.ok
    ? ok(report, `ok ${report.bin} is on PATH and answers --help`)
    : fail("missing", `${report.bin}: ${report.findings.join("; ")}`, report);
}

if (import.meta.main) {
  process.exit(await runCli(manifest, "qsm-knowledge", { validate, doctor }));
}
