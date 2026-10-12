// The hook's whole decision, as a function of the command line alone: no engine, no Node, no
// filesystem.

interface Rule {
  readonly pattern: RegExp;
  /** The wrapper call that covers the blocked one, named in the refusal. */
  readonly instead: string;
}

const GITHUB_RULES: readonly Rule[] = [
  {
    pattern: /\/pulls\/\d+\/comments\/\d+\/replies/,
    instead: 'qsm-forge gh reply <pr> <comment-id> --message "<text>"',
  },
  {
    pattern: /\/pulls\/\d+\/reviews\/\d+\/dismissals/,
    instead: "qsm-forge gh dismiss-reviews <pr>",
  },
  {
    pattern: /\/pulls\/\d+\/reviews\b/,
    instead:
      "qsm-forge gh status <pr> to read reviews, qsm-forge gh submit-review <pr> to post one",
  },
  {
    pattern: /\/pulls\/\d+\/comments\b/,
    instead: "qsm-forge gh comments <pr>",
  },
  {
    pattern:
      /\b(?:reviewThreads|resolveReviewThread|unresolveReviewThread|addPullRequestReviewThreadReply|pullRequestReviewThread)\b/,
    instead: "qsm-forge gh threads <pr>, qsm-forge gh resolve <pr> <comment-id>",
  },
  {
    pattern: /\bgh\s+pr\s+comment\b/,
    instead: 'qsm-forge gh reply <pr> <comment-id> --message "<text>"',
  },
  {
    pattern: /\bgh\s+pr\s+review\b/,
    instead: "qsm-forge gh submit-review <pr>",
  },
  {
    pattern: /\bgh\s+pr\s+view\b[^\n]*--json[^\n]*\b(?:reviews|reviewDecision|comments)\b/,
    instead: "qsm-forge gh status <pr>, or qsm-forge gh comments <pr>",
  },
];

const GITLAB_RULES: readonly Rule[] = [
  {
    pattern: /\/merge_requests\/\d+\/discussions\/[^/\s"']+\/notes/,
    instead: 'qsm-forge gl reply <mr> <note-id> --message "<text>"',
  },
  {
    pattern: /\/merge_requests\/\d+\/discussions\/[^/\s"']+/,
    instead: "qsm-forge gl resolve <mr> <note-id>",
  },
  {
    pattern: /\/merge_requests\/\d+\/discussions\b/,
    instead: "qsm-forge gl threads <mr>",
  },
  {
    pattern: /\/merge_requests\/\d+\/notes\b/,
    instead: "qsm-forge gl submit-review <mr>",
  },
  {
    pattern: /\/merge_requests\/\d+\/(?:approve|unapprove)\b/,
    instead: "qsm-forge gl submit-review <mr>",
  },
  {
    pattern: /\bglab\s+mr\s+(?:note|comment)\b/,
    instead: 'qsm-forge gl reply <mr> <note-id> --message "<text>"',
  },
  {
    pattern: /\bglab\s+mr\s+(?:approve|unapprove)\b/,
    instead: "qsm-forge gl submit-review <mr>",
  },
];

/** The tools a raw review call reaches a forge through: the two platform
 * CLIs, and the fetchers that can speak to their APIs without one. */
const INVOKERS = new Set(["gh", "glab", "curl", "wget", "http", "xh"]);

/** The forge tool named anywhere in a command line, or null when none is. */
export function forgeInvoker(line: string): string | null {
  for (const raw of line.split(/\s+/)) {
    const token = raw.replace(/^['"`(]+/, "").replace(/['"`);]+$/, "");
    if (token.length === 0 || token.startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      continue;
    }
    const name = token.split("/").at(-1) ?? token;
    if (INVOKERS.has(name)) {
      return name;
    }
  }
  return null;
}

function ruleFor(line: string): Rule | undefined {
  return [...GITHUB_RULES, ...GITLAB_RULES].find((rule) => rule.pattern.test(line));
}

/** The refusal text, or null when the command may run. */
export function reviewGuard(line: string): string | null {
  if (forgeInvoker(line) === null) {
    return null;
  }
  const rule = ruleFor(line);
  if (rule === undefined) {
    return null;
  }
  return `qsm-forge: this reads or changes review state on a pull or merge request. Use \`${rule.instead}\` instead of a raw call.`;
}
