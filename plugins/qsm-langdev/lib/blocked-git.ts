// What the Bash guard answers for a command line, as one pure function.

/** Within one segment: `git ... commit ... --no-verify|-n` (alone or in a
 * cluster of short flags), or `git ... push ... --no-verify`. */
const SKIPS_HOOKS =
  /\bgit\b[^;&|\n]*?\s(commit\b[^;&|\n]*\s(--no-verify|-[a-zA-Z]*n[a-zA-Z]*)|push\b[^;&|\n]*\s--no-verify)(\s|$)/;
const ALLOW = /\bQSM_LANGDEV_ALLOW=/;

/** How the person lets a measured regression pass: they type the command themselves, because a
 * `!` command in the prompt runs past every tool hook and no agent can type it. */
const BY_THE_PERSON =
  'Send the person the exact command; they run it once in the prompt as ! QSM_LANGDEV_ALLOW="<why>" <command>. The leak gates are never allowed.';

/** The refusal for a command an agent may not run, or null. */
export function gitDenial(command: string): string | null {
  if (SKIPS_HOOKS.test(command)) {
    return `[qsm-langdev] a commit or push without its hooks skips every gate. To let a measured regression pass once: ${BY_THE_PERSON}`;
  }
  return ALLOW.test(command)
    ? `[qsm-langdev] QSM_LANGDEV_ALLOW is the person's decision, never an agent's. ${BY_THE_PERSON}`
    : null;
}
