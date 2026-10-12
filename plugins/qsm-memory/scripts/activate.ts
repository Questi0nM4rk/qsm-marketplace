#!/usr/bin/env bun
// The installer places the binary and the two hooks and applies nothing.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  type Activation,
  type ActivationContext,
  activationMain,
  type InstallResult,
  type Step,
} from "../../../lib/install-contract.ts";

const NAME = "harness-memory";
const CLEANUP_DAYS = 7;

export type MemoryChoice = "qsm" | "skip";

function settingsPath(env: ActivationContext["env"]): string {
  const home = env.CLAUDE_CONFIG_DIR ?? resolve(env.HOME ?? homedir(), ".claude");
  return resolve(home, "settings.json");
}

/**
 * settings.json with autoMemoryEnabled false and cleanupPeriodDays at most 7, everything else
 * untouched, or null when it already says so.
 */
export function withHarnessMemoryOff(existing: string | null): string | null {
  const settings: Record<string, unknown> = existing ? JSON.parse(existing) : {};
  const days = settings.cleanupPeriodDays;
  const daysFine = typeof days === "number" && days <= CLEANUP_DAYS;
  if (settings.autoMemoryEnabled === false && daysFine) {
    return null;
  }
  settings.autoMemoryEnabled = false;
  if (!daysFine) {
    settings.cleanupPeriodDays = CLEANUP_DAYS;
  }
  return `${JSON.stringify(settings, null, 2)}\n`;
}

const KEYS = `autoMemoryEnabled: false, cleanupPeriodDays: ${CLEANUP_DAYS}`;

/** The one write, taken or not taken. A settings.json that does not parse is
 * an error naming the file: rewriting it would lose what the user has there. */
export function harnessMemoryStep(ctx: ActivationContext): Step {
  const choice = ctx.choices.memory as MemoryChoice;
  const path = settingsPath(ctx.env);
  if (choice === "skip") {
    return { name: NAME, status: "skipped", detail: `${path} left alone` };
  }
  const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
  let next: string | null;
  try {
    next = withHarnessMemoryOff(existing);
  } catch {
    return { name: NAME, status: "error", detail: `${path} does not parse as JSON; fix it first` };
  }
  if (next === null) {
    return { name: NAME, status: "already", detail: `${KEYS} already set in ${path}` };
  }
  if (ctx.dryRun) {
    return { name: NAME, status: "skipped", detail: `would write ${KEYS} into ${path}` };
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next);
  return { name: NAME, status: "installed", detail: `wrote ${KEYS} into ${path}` };
}

export const activation: Activation = {
  status: (env) => {
    const path = settingsPath(env);
    const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
    return withHarnessMemoryOff(existing) === null ? "activated" : "absent";
  },
  options: [
    {
      name: "memory",
      values: ["qsm", "skip"],
      description:
        "qsm turns Claude Code's own memory off (autoMemoryEnabled: false) and has it delete transcripts after 7 days (cleanupPeriodDays) so this archive is the one memory; skip leaves settings.json alone",
    },
  ],
  activate: (ctx): InstallResult => {
    const step = harnessMemoryStep(ctx);
    return { tool: "qsm-memory", status: step.status, detail: step.detail, steps: [step] };
  },
};

if (import.meta.main) {
  process.exit(await activationMain(activation));
}
