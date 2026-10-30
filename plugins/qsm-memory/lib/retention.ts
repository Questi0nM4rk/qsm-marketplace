// What the person typed is never deleted by a tool: Claude Code removes a transcript after
// `cleanupPeriodDays` (its default is 30), so the one value qsm ever writes there is "never", and
// anything lower is reported as a deletion wherever settings are read.
import { existsSync, readFileSync } from "node:fs";
import { fail, isRecord, messageOf, type Outcome, ok } from "../../../lib/outcome.ts";
import { claudeSettingsPath, type Env } from "../../../lib/paths.ts";

/** A hundred years: Claude Code has no "never", and a transcript is the person's. */
export const KEEP_DAYS = 36500;

/** The settings' `cleanupPeriodDays`: null when the file or the key is absent (Claude Code then
 * deletes after its default of 30 days), the number otherwise, whatever its type is not. */
export function retentionDays(settingsText: string | null): number | null {
  if (settingsText === null || settingsText === "") {
    return null;
  }
  const parsed: unknown = JSON.parse(settingsText);
  const days = isRecord(parsed) ? parsed.cleanupPeriodDays : undefined;
  if (days === undefined) {
    return null;
  }
  if (typeof days !== "number") {
    throw new TypeError(`cleanupPeriodDays is ${JSON.stringify(days)}, not a number`);
  }
  return days;
}

/** Whether a retention keeps every transcript: the key present and at least KEEP_DAYS. */
export function keepsTranscripts(days: number | null): boolean {
  return days !== null && days >= KEEP_DAYS;
}

/** The retention of the Claude home as an outcome, given the recorded choice: ok when nothing is
 * deleted, failed naming the file, the value and the fix otherwise. Under the choice `claude` a
 * deletion is the person's and ok. A settings file that does not parse is failed under any choice. */
export function retentionCheck(env: Env, choice: string | null): Outcome<{ days: number | null }> {
  const path = claudeSettingsPath(env);
  let days: number | null;
  try {
    days = retentionDays(existsSync(path) ? readFileSync(path, "utf8") : null);
  } catch (error) {
    const why = error instanceof SyntaxError ? "does not parse" : messageOf(error);
    return fail("failed", `${path}: ${why}, so its transcript retention is unknown; ${FIX}`, {
      days: null,
    });
  }
  if (keepsTranscripts(days)) {
    return ok({ days }, `transcripts are kept (cleanupPeriodDays ${days})`);
  }
  const said =
    days === null ? "30 days (cleanupPeriodDays is unset, Claude Code's default)" : `${days} days`;
  if (choice === "claude") {
    return ok(
      { days },
      `Claude Code deletes transcripts after ${said}, by the person's choice (--memory claude)`,
    );
  }
  return fail("failed", `Claude Code deletes transcripts after ${said} (${path}); ${FIX}`, {
    days,
  });
}

const FIX = `run qsm-setup activate qsm-memory -- --memory qsm, which sets cleanupPeriodDays to ${KEEP_DAYS}`;
