#!/usr/bin/env bun
// The shared install base compiles this plugin's one binary into the caller's bin directory
// and writes the completion; the extra steps put the askpass pane and its links beside it.
import { resolve } from "node:path";
import { installScript } from "../../../lib/install-base.ts";
import { askpassSteps } from "../lib/askpass/install.ts";

export const install = installScript(import.meta, {
  upstream: [{ cmd: "rbw", install: ["cargo", "install", "rbw"], hint: "cargo install rbw" }],
  extra: (ctx) => askpassSteps(ctx, resolve(import.meta.dir, "..")),
});
