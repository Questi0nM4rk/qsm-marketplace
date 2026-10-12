// Reads a shell command the way the block rule needs to read it: is any part of this line a `git
// worktree` subcommand, and which one.

const SUBCOMMAND_REPLACEMENT: Record<string, string> = {
  add: "`wt switch --create <branch>` creates the workspace and its branch",
  list: "`wt list` prints every workspace with its branch and its divergence",
  remove: "`wt remove <branch>` deletes the workspace and the branch together",
  prune: "`wt list` is the state; wt tracks its workspaces, so there is nothing to prune",
  move: "`wt switch <branch>` moves between workspaces by name, never by path",
  lock: "`wt config` holds workspace state",
  unlock: "`wt config` holds workspace state",
  repair: "`wt list` then `wt switch <branch>`; wt owns the paths",
};

const GENERIC_REPLACEMENT = "`wt --help` lists the equivalent; every subcommand has one";

/** Options git takes before its subcommand that consume the next word. */
const VALUE_OPTIONS = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
]);

/** Words that wrap a command without changing what it is. */
const WRAPPERS = new Set(["sudo", "command", "nohup", "time", "env"]);

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** The denial for a command that reaches for raw git worktree, or null. */
export function denialFor(command: string): string | null {
  for (const segment of segments(command)) {
    const subcommand = worktreeSubcommandOf(segment);
    if (subcommand !== null) {
      return denial(subcommand);
    }
  }
  return null;
}

function denial(subcommand: string): string {
  const replacement = SUBCOMMAND_REPLACEMENT[subcommand] ?? GENERIC_REPLACEMENT;
  const named = subcommand.length > 0 ? `git worktree ${subcommand}` : "git worktree";
  return `qsm-worktrunk: ${named} is blocked. Use wt instead: ${replacement}. wt addresses a workspace by branch name and computes its path; raw git leaves the path yours to track.`;
}

/** The `git worktree` subcommand this one command runs, "" for a bare
 * `git worktree`, or null when the command is not one. */
function worktreeSubcommandOf(tokens: readonly string[]): string | null {
  const rest = afterGit(tokens);
  if (rest === null) {
    return null;
  }
  const [first, ...tail] = rest;
  if (first !== "worktree") {
    return null;
  }
  return tail.find((token) => !token.startsWith("-")) ?? "";
}

/** The words after `git` and its own options, or null when the command does
 * not run git. */
function afterGit(tokens: readonly string[]): string[] | null {
  const start = skipWrappers(tokens);
  const executable = tokens[start];
  if (executable === undefined || basename(executable) !== "git") {
    return null;
  }
  return [...tokens.slice(skipGitOptions(tokens, start + 1))];
}

/** The index of the first word that is not an assignment or a wrapper. */
function skipWrappers(tokens: readonly string[]): number {
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    if (ASSIGNMENT.test(token) || WRAPPERS.has(token)) {
      index += 1;
      continue;
    }
    break;
  }
  return index;
}

/** The index of the first word at or after `from` that is not a git option. */
function skipGitOptions(tokens: readonly string[], from: number): number {
  let index = from;
  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    if (!token.startsWith("-")) {
      break;
    }
    index += VALUE_OPTIONS.has(token) ? 2 : 1;
  }
  return index;
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

/** The command line split into the commands it runs, each already tokenised.
 * Quotes are honoured, so `echo "git worktree add"` is one word, not three. */
function segments(command: string): string[][] {
  const all: string[][] = [];
  let current: string[] = [];
  for (const [piece = ""] of command.matchAll(SCANNER)) {
    if (SEPARATORS.has(piece)) {
      if (current.length > 0) {
        all.push(current);
        current = [];
      }
      continue;
    }
    current.push(unquote(piece));
  }
  if (current.length > 0) {
    all.push(current);
  }
  return all;
}

/** One separator between commands, or one word: a run of bare characters,
 * escapes, and quoted spans. Anything else (a stray quote) is skipped. */
const SCANNER = /[;|&\n]|(?:[^\s;|&\n'"\\]|\\.|'[^']*'|"[^"]*")+/g;
const SEPARATORS = new Set([";", "|", "&", "\n"]);
const QUOTED = /\\(.)|'([^']*)'|"([^"]*)"/g;

function unquote(word: string): string {
  return word.replace(
    QUOTED,
    (_match, escaped, single, double) => escaped ?? single ?? double ?? "",
  );
}
