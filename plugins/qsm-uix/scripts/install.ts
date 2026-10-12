#!/usr/bin/env bun
// The shared install base compiles this plugin's own binary into the user's
// bin directory, so the kit runs from a shell or a test with no checkout in
// the room, writes its completion, and probes the two external tools the
// verbs measure through.
//
// The external tools are never installed here. They come from the system's
// package manager, which asks for a password and writes outside the user's
// home; a printed command is a smaller surprise than that happening behind
// an install of a plugin. The image tool is required: the five measuring
// verbs, the core of the kit, read images through it. The screenshot tool is
// optional: only screenshot and burst capture, and the measuring verbs work
// on an image captured elsewhere.
import { installScript } from "../../../lib/install-base.ts";
import { UPSTREAM } from "../lib/doctor.ts";

export const install = installScript(import.meta, {
  // the same rows doctor checks: one list, so install and doctor agree
  upstream: UPSTREAM,
});
