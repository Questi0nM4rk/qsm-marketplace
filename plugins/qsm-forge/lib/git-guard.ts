// The git and gh forms the git rule refuses, as a function of the command line alone: a gh call
// split over lines or with backticks in its body, a lightweight tag, a pull that flattens merges.
// Whether a push is behind its upstream needs git itself, so register asks that on its own.

interface Rule {
  readonly pattern: RegExp;
  readonly refusal: string;
}

/** gh has a skill to point at; the git forms carry their whole reason in the refusal. */
const MORE = "For more, load the qsm-forge:review-threads skill.";

const RULES: readonly Rule[] = [
  {
    pattern: /\bgh\b[^\n]*\\\n/,
    refusal: `qsm-forge: a gh command is one line, because permission matching reads one line. Drop the backslash continuation. ${MORE}`,
  },
  {
    pattern: /\bgh\b.*--(?:body|notes)(?:=|\s+)(?:"[^"]*`|'[^']*`|`)/s,
    refusal: `qsm-forge: backticks in --body or --notes run as a command and the text posts mangled. Write the body to a file and pass --body-file or --notes-file. ${MORE}`,
  },
  {
    pattern:
      /\bgit\s+tag\s+(?![^;&|\n]*(?:\s-[a-z]*[asdlmfv]|\s--(?:annotate|sign|delete|list|message|verify|contains)))[^-\s]/,
    refusal: `qsm-forge: a lightweight tag is skipped by push --follow-tags without a word. Tag with git tag -a vX.Y.Z -m "...".`,
  },
  {
    pattern: /\bgit\s+pull\b[^;&|\n]*\s(?:--rebase(?![=\w-])|-r\b)/,
    refusal: `qsm-forge: a plain --rebase flattens a worker's merge commit and replays its conflicts. Use git pull --rebase=merges.`,
  },
];

/** The refusal for a git or gh form the git rule refuses, or null. */
export function gitGuard(line: string): string | null {
  return RULES.find((rule) => rule.pattern.test(line))?.refusal ?? null;
}

/** Whether the line pushes without first pulling with merges in the same call. */
export function pushesWithoutPull(line: string): boolean {
  return /\bgit\s+push\b/.test(line) && !/\bgit\s+pull\s+--rebase=merges\b/.test(line);
}

export const BEHIND_REFUSAL = `qsm-forge: the upstream is ahead, so this push would be rejected. Run git pull --rebase=merges first, then push.`;
