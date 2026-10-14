#!/usr/bin/env bun

// qsm-toolbox: the one answer a skill cannot reach by reading, which is what is actually on this
// machine right now.

import { type Handler, runCli } from "../../../lib/cli-base.ts";
import { type Outcome, ok } from "../../../lib/outcome.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import { lines, realProber, statuses } from "../lib/doctor.ts";
import manifestJson from "../qsm.json" with { type: "json" };

const manifest = parseManifest(manifestJson);

/** doctor reports; it never gates. A toolbox tool is optional, and turning a
 * missing one into a failure would fail pipelines nobody asked it to. */
const doctorVerb: Handler = (): Outcome => {
  const report = statuses(realProber);
  return ok(report, lines(report).join("\n"));
};

if (import.meta.main) {
  process.exit(await runCli(manifest, "qsm-toolbox", { doctor: doctorVerb }));
}
