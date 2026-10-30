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
import { getState, openArchive, resolveDbPath, setState } from "../lib/store.ts";
import { KEEP_DAYS, keepsTranscripts, retentionDays } from "../lib/retention.ts";

const NAME = "harness-memory";

const MEMORY_CHOICES = ["qsm", "claude"] as const;
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

/** The recorded choice and activation date; nothing is recorded while no archive exists. */
function recorded(env: ActivationContext["env"]) {
  if (!existsSync(resolveDbPath(env))) {
    return { retention: null, activatedAt: null };
  }
  const db = openArchive(env);
  return { retention: getState(db, "retention"), activatedAt: getState(db, "activated_at") };
}

/** The settings.json text qsm writes, or null when it needs no write or the choice is claude. */
function settingsToWrite(choice: MemoryChoice, path: string): string | null {
  return choice === "qsm"
    ? withHarnessMemoryOff(existsSync(path) ? readFileSync(path, "utf8") : null)
    : null;
}

/** Records the choice, and under qsm the day of activation unless one is recorded. */
function recordChoice(env: ActivationContext["env"], choice: MemoryChoice): void {
  const db = openArchive(env);
  setState(db, "retention", choice);
  if (choice === "qsm" && getState(db, "activated_at") === null) {
    setState(db, "activated_at", new Date().toISOString());
  }
}

interface Plan {
  /** the settings.json text to write, or null for none */
  readonly next: string | null;
  /** whether the choice is yet to be recorded */
  readonly record: boolean;
  /** what the step writes, in words */
  readonly what: string;
}

/** What the choice would write: throws when settings.json does not parse. */
function planWrite(ctx: ActivationContext, choice: MemoryChoice, path: string): Plan {
  const next = settingsToWrite(choice, path);
  const before = recorded(ctx.env);
  const record = before.retention !== choice || (choice === "qsm" && before.activatedAt === null);
  const what = [
    ...(next === null ? [] : [`${KEYS} into ${path}`]),
    ...(record ? [`retention ${choice} into the archive`] : []),
    ...(choice === "claude" ? [`${path} left alone`] : []),
  ].join("; ");
  return { next, record, what };
}

/** The one write, taken or not taken: the choice into the archive, and under qsm the settings.
 * A settings.json that does not parse is an error naming the file: rewriting it would lose what the
 * user has there. */
export function harnessMemoryStep(ctx: ActivationContext): Step {
  const choice = MEMORY_CHOICES.find((c) => c === ctx.choices.memory);
  const path = claudeSettingsPath(ctx.env);
  if (choice === undefined) {
    return { name: NAME, status: "error", detail: `unknown memory choice '${ctx.choices.memory}'` };
  }
  let plan: Plan;
  try {
    plan = planWrite(ctx, choice, path);
  } catch {
    return { name: NAME, status: "error", detail: `${path} does not parse as JSON; fix it first` };
  }
  if (plan.next === null && !plan.record) {
    return { name: NAME, status: "already", detail: `${KEYS} already set in ${path}` };
  }
  if (ctx.dryRun) {
    return { name: NAME, status: "skipped", detail: `would write ${plan.what}` };
  }
  if (plan.next !== null) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, plan.next);
  }
  if (plan.record) {
    recordChoice(ctx.env, choice);
  }
  return { name: NAME, status: "installed", detail: `wrote ${plan.what}` };
}

export const activation: Activation = {
  status: (env) => {
    const { retention } = recorded(env);
    if (retention === "claude") {
      return "activated";
    }
    const path = claudeSettingsPath(env);
    const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
    return retention === "qsm" && withHarnessMemoryOff(existing) === null ? "activated" : "absent";
  },
  options: [
    {
      name: "memory",
      values: [...MEMORY_CHOICES],
      description:
        "qsm turns Claude Code's own memory off (autoMemoryEnabled: false) and stops it deleting transcripts (cleanupPeriodDays 36500, its default deletes after 30 days) so this archive and the transcripts are the one memory, and packs the idle ones monthly; claude leaves settings.json alone, so Claude Code's own retention applies and nothing is packed",
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
