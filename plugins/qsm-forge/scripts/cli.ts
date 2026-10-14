#!/usr/bin/env bun

// qsm-forge: the one binary for both forges, "qsm-forge gh <verb>" for GitHub pull requests and
// "qsm-forge gl <verb>" for GitLab merge requests.

import { runCli } from "../../../lib/cli-base.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import { forgeDoctor } from "../lib/doctor.ts";
// A static import, not a runtime `readFileSync` of a sibling path: bun's compiler inlines JSON
// imports into the binary, so `--help` works with no checkout in the room (AGENTS.md law 9).
import manifestJson from "../qsm.json" with { type: "json" };
import { handlers as ghHandlers } from "./cli-gh.ts";
import { handlers as glHandlers } from "./cli-gl.ts";

const manifest = parseManifest(manifestJson);

if (import.meta.main) {
  process.exit(
    await runCli(manifest, "qsm-forge", {
      ...ghHandlers,
      ...glHandlers,
      doctor: () => forgeDoctor(),
    }),
  );
}
