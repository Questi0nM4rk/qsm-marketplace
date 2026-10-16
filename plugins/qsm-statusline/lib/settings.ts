// Reading the harness settings file, and nothing else.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord, messageOf } from "../../../lib/outcome.ts";
import { claudeDir, type Env } from "../../../lib/paths.ts";

/** What the settings entry has to run. */
export const STATUS_LINE_COMMAND = "qsm-statusline render";

export const STATUS_LINE_ENTRY = {
  type: "command",
  command: STATUS_LINE_COMMAND,
  padding: 1,
} as const;

export type SettingsState =
  | { readonly kind: "wired" }
  | { readonly kind: "absent" }
  | { readonly kind: "other"; readonly command: string }
  | { readonly kind: "unreadable"; readonly reason: string };

/** The harness settings file, under Claude Code's home. */
export function settingsPath(env: Env): string {
  return join(claudeDir(env), "settings.json");
}

function errorCode(cause: unknown): string | null {
  if (!isRecord(cause)) {
    return null;
  }
  return typeof cause.code === "string" ? cause.code : null;
}

function unreadable(reason: string): SettingsState {
  return { kind: "unreadable", reason };
}

/** The statusLine entry of a parsed settings file. */
function classify(parsed: unknown): SettingsState {
  if (!isRecord(parsed)) {
    return unreadable("the settings file does not hold a JSON object");
  }
  const entry = parsed.statusLine;
  if (!isRecord(entry)) {
    return { kind: "absent" };
  }
  const command = typeof entry.command === "string" ? entry.command : "";
  if (entry.type === "command" && command === STATUS_LINE_COMMAND) {
    return { kind: "wired" };
  }
  return { kind: "other", command };
}

/** A missing file is a fresh machine, which is "absent". */
export function readStatusLine(path: string): SettingsState {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (cause) {
    return errorCode(cause) === "ENOENT" ? { kind: "absent" } : unreadable(messageOf(cause));
  }
  try {
    return classify(JSON.parse(raw));
  } catch (cause) {
    return unreadable(messageOf(cause));
  }
}

export function describe(state: SettingsState): string {
  if (state.kind === "wired") {
    return `the settings run ${STATUS_LINE_COMMAND}`;
  }
  if (state.kind === "absent") {
    return "no status line is configured";
  }
  if (state.kind === "other") {
    return `another status line is configured: ${state.command}`;
  }
  return `the settings file could not be read: ${state.reason}`;
}
