// Where the command output filter comes from, in one place, so the installer, the doctor, and the
// documentation cannot disagree about it.

import { isPlainObject } from "./toon-scalar.ts";

const FILTER_REPO = "https://github.com/rtk-ai/rtk";

export const FILTER_REVISION = "5d32d0736f686b69d1e8b9dc45c007d4eb77a0a2";

export const FILTER_INSTALL_COMMAND = `cargo install --git ${FILTER_REPO} --rev ${FILTER_REVISION} --locked`;

/** The subcommand the filter is handed on a tool call. */
export const FILTER_HOOK_ARGS = ["hook", "claude"] as const;

/**
 * Splits a shell command on the operators that chain one command into the next: `&&`, `||`, `;`,
 * and `|`.
 */
const COMMAND_SEPARATOR = /&&|\|\||[;|]/;

/** True when the first word of any segment of `command` is `git`. */
export function runsGit(command: string): boolean {
  return command
    .split(COMMAND_SEPARATOR)
    .some((segment) => segment.trim().split(/\s+/)[0] === "git");
}

/** What the filter made of a command: the command to run instead, or the reason to refuse it. */
export interface FilterAnswer {
  readonly command: string | null;
  readonly deny: string | null;
}

export function isFilterAnswer(value: unknown): value is FilterAnswer {
  return (
    isPlainObject(value) &&
    (value.command === null || typeof value.command === "string") &&
    (value.deny === null || typeof value.deny === "string")
  );
}

export const NO_ANSWER: FilterAnswer = { command: null, deny: null };

/** The harness's exit code for "block this call, here is why on stderr". */
const BLOCK_EXIT = 2;

/**
 * The filter's own reply to the PreToolUse payload: exit 2 refuses with its stderr, any other
 * non-zero exit is its own failure and changes nothing, and exit 0 may carry the rewritten command
 * at `hookSpecificOutput.updatedInput.command`.
 */
export function filterAnswer(reply: {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}): FilterAnswer {
  if (reply.status === BLOCK_EXIT) {
    return { command: null, deny: reply.stderr.trim() || "refused by the command output filter" };
  }
  if (reply.status !== 0 || reply.stdout.trim().length === 0) {
    return NO_ANSWER;
  }
  try {
    const parsed: unknown = JSON.parse(reply.stdout);
    const specific = isPlainObject(parsed) ? parsed.hookSpecificOutput : undefined;
    const updated = isPlainObject(specific) ? specific.updatedInput : undefined;
    const rewritten = isPlainObject(updated) ? updated.command : undefined;
    return typeof rewritten === "string" ? { command: rewritten, deny: null } : NO_ANSWER;
  } catch {
    return NO_ANSWER;
  }
}
