#!/usr/bin/env bun
// The shared install base compiles this plugin's one binary into the caller's bin directory
// and writes the completion.
import { installScript } from "../../../lib/install-base.ts";

export const install = installScript(import.meta, {
  upstream: [{ cmd: "rbw", install: ["cargo", "install", "rbw"], hint: "cargo install rbw" }],
});
