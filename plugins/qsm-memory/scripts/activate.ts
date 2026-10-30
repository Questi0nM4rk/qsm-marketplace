#!/usr/bin/env bun
// The installer places the binary and the two hooks and applies nothing.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  type Activation,
  type ActivationContext,
  activationMain,
  type InstallResult,
  type Step,
} from "../../../lib/install-contract.ts";
import { claudeSettingsPath } from "../../../lib/paths.ts";
import { KEEP_DAYS, keepsTranscripts, retentionDays } from "../lib/retention.ts";

const NAME = "harness-memory";

const MEMORY_CHOICES = ["qsm", "skip"] as const;
export type MemoryChoice = (typeof MEMORY_CHOICES)[number];

/** The settings object in `text`; JSON that is not an object is as unusable as JSON that does not
 * parse. */
function parseSettings(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("settings.json is not a JSON object");
  }
  return Object.fromEntries(Object.entries(parsed));
}

/**
 * settings.json with autoMemoryEnabled false and cleanupPeriodDays at least KEEP_DAYS, everything
 * else untouched, or null when it already says so. A value below KEEP_DAYS is raised, never the
 * other way: a transcript is the person's, and a tool never sets it up for deletion.
 */
export function withHarnessMemoryOff(existing: string | null): string | null {
  const settings = existing === null || existing === "" ? {} : parseSettings(existing);
  const keeps = keepsTranscripts(retentionDays(existing));
  if (settings.autoMemoryEnabled === false && keeps) {
    return null;
  }
  settings.autoMemoryEnabled = false;
  if (!keeps) {
    settings.cleanupPeriodDays = KEEP_DAYS;
  }
  return `${JSON.stringify(settings, null, 2)}\n`;
}

const KEYS = `autoMemoryEnabled: false, cleanupPeriodDays: ${KEEP_DAYS}`;

/** The one write, taken or not taken. A settings.json that does not parse is
 * an error naming the file: rewriting it would lose what the user has there. */
export function harnessMemoryStep(ctx: ActivationContext): Step {
  const choice = MEMORY_CHOICES.find((c) => c === ctx.choices.memory);
  const path = claudeSettingsPath(ctx.env);
  if (choice === undefined) {
    return { name: NAME, status: "error", detail: `unknown memory choice '${ctx.choices.memory}'` };
  }
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
    const path = claudeSettingsPath(env);
    const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
    return withHarnessMemoryOff(existing) === null ? "activated" : "absent";
  },
  options: [
    {
      name: "memory",
      values: [...MEMORY_CHOICES],
      description:
        "qsm turns Claude Code's own memory off (autoMemoryEnabled: false) and stops it deleting transcripts (cleanupPeriodDays 36500, its default deletes after 30 days) so this archive and the transcripts are the one memory; skip leaves settings.json alone",
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
