// What the Bash guard answers for a command line, as one pure function.

export interface GitDecision {
  readonly decision: "deny" | "ask";
  readonly reason: string;
}

/** Within one segment: `git ... commit ... --no-verify|-n` (alone or in a
 * cluster of short flags), or `git ... push ... --no-verify`. */
const SKIPS_HOOKS =
  /\bgit\b[^;&|\n]*?\s(commit\b[^;&|\n]*\s(--no-verify|-[a-zA-Z]*n[a-zA-Z]*)|push\b[^;&|\n]*\s--no-verify)(\s|$)/;
const ALLOW = /\bQSM_LANGDEV_ALLOW=/;

export function gitDecision(command: string): GitDecision | null {
  if (SKIPS_HOOKS.test(command)) {
    const reason =
      '[qsm-langdev] a commit or push without its hooks skips every gate. To let a measured regression pass once, prefix that one command with QSM_LANGDEV_ALLOW="<why>"; it asks the person first. The leak gates are never allowed.';
    return { decision: "deny", reason };
  }
  return ALLOW.test(command)
    ? {
        decision: "ask",
        reason:
          "[qsm-langdev] QSM_LANGDEV_ALLOW lets a measured regression pass on this one command; a person decides.",
      }
    : null;
}
