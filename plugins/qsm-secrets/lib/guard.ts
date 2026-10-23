// What the guard refuses: a Bash command that would put a stored credential into the tool result, read
// from its syntax tree and not from its text. The tree sees through sudo, env, nice, timeout, command,
// xargs, `sh -c`, subshells, pipelines and command substitutions, because shell-ast resolves each call
// to the command that finally runs. It needs the WASM parser, which the hook sandbox cannot load, so
// it is the verb `qsm-secrets guard` and the hook calls it.

import { realpathSync } from "node:fs";
import {
  type CallExprNode,
  type CustomWrapperResolver,
  findAll,
  ParseSizeError,
  ParseSyntaxError,
  parse,
  type Redirect,
  type ShellFile,
  type Stmt,
  type UnwrappedCall,
  unwrapDeepParsed,
  type Word,
  wordToLit,
  wordToParts,
} from "@questi0nm4rk/shell-ast";
import { linkedKinds } from "./askpass/link.ts";
import { LINK_PREFIX } from "./askpass/paths.ts";
import {
  expand,
  globMentioned,
  mentioned,
  normalizePath,
  type PathEnv,
  PATH_VARIABLES,
  protectedRoots,
  type Root,
  reaches,
} from "./protected.ts";
import { placeholderIds } from "./substitute.ts";

export type RefusalCode =
  | "vault-reader"
  | "bus-secrets"
  | "keyring-files"
  | "rendered-config"
  | "keyring-library"
  | "credential-file"
  | "fd3-to-output"
  | "single-quoted-placeholder"
  | "askpass-pane"
  | "unreadable-command";

export interface Refusal {
  readonly code: RefusalCode;
  /** what matched, for the log */
  readonly command: string;
  /** what the agent is told: the code, why, and the qsm-secrets verb to use instead */
  readonly reason: string;
}

const USE_WRAPPER =
  "Use `qsm-secrets pipe <key> -- <cmd>` or `qsm-secrets env <key>=<VAR> -- <cmd>`: the value reaches the command without reaching this transcript.";

const PASS_STORE_INSTEAD =
  "A pass entry is not reachable through a wrapper: run it in your own terminal, or move the key into the vault with `qsm-secrets set <key>` and use `qsm-secrets pipe <key> -- <cmd>`.";

function refuse(code: RefusalCode, command: string, why: string, instead: string): Refusal {
  return { code, command, reason: `[qsm-secrets ${code}] ${why} ${instead}` };
}

const VAULT_TOOLS: ReadonlySet<string> = new Set([
  "secret-tool",
  "rbw",
  "bw",
  "pass",
  "gopass",
  "keepassxc-cli",
  "kwallet-query",
  "op",
]);
/** The secrets service by its bus name or its object path, either of which names it to a bus tool. */
const SECRETS_SERVICE = /org[./]freedesktop[./]secret/i;
/** A word whose value the shell decides later, so the guard cannot read where it points. */
const EXPANDS = /[$`]/;
const BUS_TOOLS: ReadonlySet<string> = new Set([
  "busctl",
  "gdbus",
  "dbus-send",
  "dbus-monitor",
  "qdbus",
  "qdbus6",
]);
const QUICKSHELL_TOOLS: ReadonlySet<string> = new Set(["qs", "quickshell"]);
const INTERPRETERS = /^(python[\d.]*|node|nodejs|bun|deno|ruby|perl)$/;
const INLINE_CODE_FLAGS: ReadonlySet<string> = new Set(["-c", "-e", "-p", "--eval", "--print"]);
const KEYRING_LIBRARY = /keyring|secretstorage|keytar|libsecret|org\.freedesktop\.secret/i;

/** Commands that put a file's content on their output or into another file. */
const READERS: ReadonlySet<string> = new Set([
  "cat",
  "tac",
  "nl",
  "bat",
  "batcat",
  "head",
  "tail",
  "less",
  "more",
  "most",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "ag",
  "ack",
  "sed",
  "awk",
  "gawk",
  "jq",
  "yq",
  "xxd",
  "od",
  "hexdump",
  "strings",
  "base64",
  "cp",
  "mv",
  "rsync",
  "scp",
  "tar",
  "zip",
  "gzip",
  "dd",
  "sort",
  "uniq",
  "cut",
  "paste",
  "diff",
  "cmp",
  "vi",
  "vim",
  "nvim",
  "nano",
  "view",
  "source",
  ".",
]);

/** Commands that name a path without reading what is in it. */
const NAMES_ONLY: ReadonlySet<string> = new Set([
  "ls",
  "stat",
  "file",
  "du",
  "test",
  "[",
  "[[",
  "echo",
  "printf",
  "realpath",
  "readlink",
  "basename",
  "dirname",
  "which",
]);

const FILE_READERS: ReadonlySet<string> = new Set([
  // `rtk read <file>` once the rtk wrapper is unwrapped; the shell builtin's arguments are variable
  // names, which no credential file pattern matches.
  "read",
  "cat",
  "bat",
  "batcat",
  "head",
  "tail",
  "less",
  "more",
]);

/** Files whose whole content is a credential. */
const CREDENTIAL_FILES: readonly RegExp[] = [
  /(^|\/)\.env(\.[^/]*)?$/,
  /(^|\/)\.netrc$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.pgpass$/,
  /(^|\/)\.git-credentials$/,
  /(^|\/)\.ssh\/id_[^/]+$/,
  /(^|\/)\.aws\/credentials$/,
  /(^|\/)credentials(\.json)?$/,
  /\.(pem|key|p12|pfx)$/,
];

const FD3_TARGETS: ReadonlySet<string> = new Set([
  "1",
  "2",
  "/dev/stdout",
  "/dev/stderr",
  "/dev/fd/1",
  "/dev/fd/2",
  "/proc/self/fd/1",
  "/proc/self/fd/2",
]);
const OUTPUT_OPS: ReadonlySet<string> = new Set([">", ">>", ">|", ">&", "&>"]);
const INPUT_OPS: ReadonlySet<string> = new Set(["<", "<>"]);

/** xargs flags that take the next word as their value. */
const XARGS_VALUE_FLAGS: ReadonlySet<string> = new Set([
  "-I",
  "-n",
  "--max-args",
  "-P",
  "--max-procs",
  "-d",
  "--delimiter",
  "-E",
  "-L",
  "--max-lines",
  "-s",
  "--max-chars",
  "-a",
  "--arg-file",
]);

const MAX_DEPTH = 8;

/** Whether a flag of `name` ends the flags: `command -v cmd` only looks `cmd` up, so nothing runs. */
function looksUp(name: string, flag: string): boolean {
  return name === "command" && /^-[a-zA-Z]*[vV]/.test(flag);
}

/** Wrappers whose command sits among positional words of their own (`flock <file> cmd`, `chrt <prio>
 * cmd`), so every word may start it and each is judged as a command. */
const SCANNED_WRAPPERS: ReadonlySet<string> = new Set([
  "setsid",
  "stdbuf",
  "flock",
  "ionice",
  "chrt",
  "watch",
  "nohup",
  "unbuffer",
  "taskset",
]);
const FIND_EXEC: ReadonlySet<string> = new Set(["-exec", "-execdir", "-ok", "-okdir"]);
const SECRETS_RUNNERS: ReadonlySet<string> = new Set(["env", "pipe", "check"]);

type Words = readonly (string | null)[];

const isText = (word: string | null | undefined): word is string => typeof word === "string";

function findStarts(words: Words): number[] {
  return words.flatMap((word, at) =>
    isText(word) && FIND_EXEC.has(word) && isText(words[at + 1]) ? [at + 1] : [],
  );
}

function secretsStarts(words: Words): number[] {
  const verb = words.find((word) => isText(word) && !word.startsWith("-"));
  const dashes = words.indexOf("--");
  return isText(verb) && SECRETS_RUNNERS.has(verb) && dashes !== -1 ? [dashes + 1] : [];
}

function flagged(name: string, words: Words): number[] {
  let at = 0;
  for (
    let word = words[at];
    isText(word) && word.startsWith("-") && word !== "--";
    word = words[at]
  ) {
    if (looksUp(name, word)) {
      return [];
    }
    at += name === "xargs" && XARGS_VALUE_FLAGS.has(word) ? 2 : 1;
  }
  at += words[at] === "--" ? 1 : 0;
  return isText(words[at]) ? [at] : [];
}

/** Where each command a runner runs starts among its words: `xargs [flags] cmd` and `command [flags]
 * cmd` run `cmd`; `qsm-secrets env|pipe|check ... -- cmd` and `find -exec cmd` run it too, and a
 * scanned wrapper may run it at any word. Empty when there is none, it is dynamic, or the runner only
 * looks it up. */
function innerStarts(name: string, args: readonly Word[]): number[] {
  const words = args.map(wordToLit);
  if (SCANNED_WRAPPERS.has(name)) {
    return words.flatMap((word, at) => (isText(word) ? [at] : []));
  }
  if (name === "find") {
    return findStarts(words);
  }
  if (name === "qsm-secrets") {
    return secretsStarts(words);
  }
  return name === "xargs" || name === "command" ? flagged(name, words) : [];
}

type WordPart = Word["parts"][number];
type ParamPart = Extract<WordPart, { type: "ParamExp" }>;

/** `${NAME}` with no operator, index, slice or replacement: the same value as `$NAME`. */
function plainBraced(part: ParamPart): boolean {
  return (
    !part.short &&
    part.param !== null &&
    part.exp === null &&
    part.index === null &&
    part.slice === null &&
    part.repl === null &&
    !part.excl &&
    // `${#NAME}`, the length operator
    !part.length &&
    !part.width &&
    part.names === ""
  );
}

/** One part as the shell would hand it on. shell-ast writes a braced expansion as `${...}`, which
 * loses the name, so a plain `${NAME}` is spelled out here and reads like `$NAME`. */
function partText(part: WordPart, word: Word): string {
  if (part.type === "ParamExp" && plainBraced(part)) {
    return `\${${part.param?.value ?? ""}}`;
  }
  if (part.type === "DblQuoted") {
    return part.parts.map((inner) => partText(inner, word)).join("");
  }
  return wordToParts({ ...word, parts: [part] })
    .map((out) => (out.kind === "literal" ? out.value : out.sourceText))
    .join("");
}

/** A word as the shell would hand it on, with an expansion left as written. The types say a
 * redirect always has a word, the processor serializes a missing one as null, and a missing word
 * names nothing, so it reads as empty text rather than throwing; judgeRedirect refuses a redirect
 * with no word before this is reached. */
function textOf(word: Word | null | undefined): string {
  if (word === null || word === undefined) {
    return "";
  }
  return word.parts.map((part) => partText(part, word)).join("");
}

/** A path variable with an operator (`${HOME:-x}`, `${HOME#/}`, `${!HOME}`) has a value the
 * guard cannot know without running the shell, so it cannot tell where the command points. */
function judgeParameters(ast: ShellFile): Refusal | null {
  for (const part of findAll(ast, "ParamExp")) {
    const name = part.param?.value;
    if (name !== undefined && PATH_VARIABLES.has(name) && !part.short && !plainBraced(part)) {
      return refuse(
        "unreadable-command",
        `\${${name}...}`,
        `\`\${${name}...}\` has a value the guard cannot work out, so it cannot tell whether it names a credential path.`,
        `Write the path with \`$${name}\` or \`\${${name}}\` and no operator.`,
      );
    }
  }
  return null;
}

const basename = (command: string): string => command.slice(command.lastIndexOf("/") + 1);

/** The command's name as the shell runs it: `\\rbw` and `r\\bw` are `rbw`. */
const nameOf = (command: string): string => basename(command.replaceAll("\\", ""));

interface Effective {
  readonly name: string;
  /** the words after the command word */
  readonly args: readonly Word[];
}

/** Every command a layer of the wrapper chain runs. A `sh -c` body is judged as a whole by the caller. */
function effective(layer: UnwrappedCall): Effective | null {
  if (layer.kind === "plain") {
    return { name: nameOf(layer.cmd), args: layer.raw.args.slice(1) };
  }
  if (layer.kind === "wrapped") {
    return { name: nameOf(layer.cmd), args: layer.innerRaw.args.slice(1) };
  }
  return null;
}

interface Context {
  /** where a `cd` on the way down left the shell, when that is known */
  readonly cwd: { at?: string | undefined };
  readonly env: PathEnv;
  readonly roots: readonly Root[];
  /** a redirect of descriptor 3 to the output was seen on the way down */
  readonly fd3Out: boolean;
  readonly depth: number;
}

function realOf(text: string): string | undefined {
  if (text.length === 0 || /[\s*?[\]{}$`'"]/.test(text)) {
    return undefined;
  }
  try {
    return realpathSync(text);
  } catch {
    return undefined;
  }
}

function pathHit(text: string, ctx: Context): Root | undefined {
  const spelled = mentioned(text, ctx.roots, ctx.env);
  if (spelled !== undefined) {
    return spelled;
  }
  const globbed = globMentioned(text, ctx.roots, ctx.env);
  if (globbed !== undefined) {
    return globbed;
  }
  const { at } = ctx.cwd;
  if (at !== undefined && !/^[/~$-]/.test(text)) {
    const relative = reaches(`${at}/${text}`, ctx.roots, ctx.env, false);
    if (relative !== undefined) {
      return relative;
    }
  }
  const real = realOf(text.replace(/^~(?=\/|$)/, ctx.env.home ?? "~"));
  return real === undefined ? undefined : reaches(real, ctx.roots, ctx.env, false);
}

const ASKPASS_WHY =
  "the askpass pane asks the person and prints the answer, so the typed text would be this tool result, or would be sent to a socket the caller names.";
const ASKPASS_INSTEAD =
  "Ask through `qsm-secrets set <key> --gui`; sudo, ssh, git and hook-kit run the `qsm-askpass-<kind>` links themselves, and `sudo -A <cmd>` is allowed.";

/** The reply socket's directory of the pane: any command that names it could forge an answer. */
function askpassRoot(env: PathEnv): Root[] {
  return env.runtimeDir === undefined || env.runtimeDir === ""
    ? []
    : [{ path: `${env.runtimeDir}/qsm-askpass`, kind: "askpass" }];
}

/** Whether the call is a consumer-only entry point of the pane: a `qsm-askpass-<kind>` link, or
 * `qsm-secrets askpass <kind>` for a kind that prints its answer. */
function runsAskpass(name: string, texts: readonly string[]): boolean {
  if (name.startsWith(LINK_PREFIX)) {
    return true;
  }
  // Every word counts, flag values and words after `--` included, so neither a flag nor `--`
  // placed before the kind can hide it: `askpass` with any linked kind among them is refused,
  // which fails closed.
  const words = texts.map((t) => t.replace(/^--?[\w-]+=/, ""));
  return (
    name === "qsm-secrets" &&
    words.includes("askpass") &&
    words.some((w) => linkedKinds().includes(w))
  );
}

/** The pane's doors: its entry points, and its IPC target, which an expansion word could spell
 * without the text saying `askpass`. */
function judgeAskpass(name: string, texts: readonly string[], shown: string): Refusal | null {
  if (!(name.startsWith(LINK_PREFIX) || name === "qsm-secrets" || QUICKSHELL_TOOLS.has(name))) {
    return null;
  }
  const ipc = QUICKSHELL_TOOLS.has(name) && texts.includes("ipc");
  const spelled = ipc && (texts.includes("askpass") || texts.some((t) => EXPANDS.test(t)));
  return runsAskpass(name, texts) || spelled
    ? refuse("askpass-pane", shown, ASKPASS_WHY, ASKPASS_INSTEAD)
    : null;
}

function isGet(name: string, texts: readonly string[]): boolean {
  return name === "qsm-secrets" && texts.find((t) => !t.startsWith("-")) === "get";
}

function judgeCall(name: string, words: readonly Word[], ctx: Context): Refusal | null {
  const texts = words.map(textOf);
  const shown = `${name} ${texts.join(" ")}`.trim().slice(0, 80);
  const pane = judgeAskpass(name, texts, shown);
  if (pane !== null) {
    return pane;
  }
  if (name === "qsm-secrets") {
    return ctx.fd3Out && isGet(name, texts)
      ? refuse(
          "fd3-to-output",
          shown,
          "`qsm-secrets get` writes to descriptor 3, and this one points it back at the tool result.",
          `${USE_WRAPPER} Open descriptor 3 on a file or a pipe to the consumer instead.`,
        )
      : null;
  }
  if (VAULT_TOOLS.has(name)) {
    return refuse(
      "vault-reader",
      shown,
      `\`${name}\` can print a stored credential to this tool result.`,
      `${USE_WRAPPER} To store one, \`qsm-secrets set <key>\`; to browse, \`qsm-secrets list\` or \`qsm-secrets has <key>\`.`,
    );
  }
  if (BUS_TOOLS.has(name) && texts.some((t) => SECRETS_SERVICE.test(t) || EXPANDS.test(t))) {
    return refuse(
      "bus-secrets",
      shown,
      "this talks over the bus to the secret service, or to a destination the guard cannot read, and the secret service can return a stored credential.",
      `${USE_WRAPPER} To browse, \`qsm-secrets list\`.`,
    );
  }
  if (INTERPRETERS.test(name)) {
    const inline = texts.some((t) => INLINE_CODE_FLAGS.has(t));
    const module = texts[texts.indexOf("-m") + 1];
    const mentionsLibrary =
      (inline && texts.some((t) => KEYRING_LIBRARY.test(t))) ||
      (texts.includes("-m") && module !== undefined && KEYRING_LIBRARY.test(module));
    if (mentionsLibrary) {
      return refuse(
        "keyring-library",
        shown,
        "an inline script that uses a keyring library reads a stored credential into this tool result.",
        USE_WRAPPER,
      );
    }
  }
  return judgePaths(name, texts, shown, ctx);
}

function judgePaths(
  name: string,
  texts: readonly string[],
  shown: string,
  ctx: Context,
): Refusal | null {
  for (const text of texts) {
    const hit = pathHit(text, ctx);
    if (hit?.kind === "askpass") {
      return refuse("askpass-pane", shown, ASKPASS_WHY, ASKPASS_INSTEAD);
    }
    if (hit?.kind === "store" && !NAMES_ONLY.has(name)) {
      return refuse(
        "keyring-files",
        shown,
        `\`${name}\` is pointed at a secret store (the keyring, the vault's data directory or the pass store), whose files hold stored credentials.`,
        hit.path.endsWith("/.password-store") || hit.path === ctx.env.passwordStore
          ? PASS_STORE_INSTEAD
          : USE_WRAPPER,
      );
    }
    if (hit?.kind === "rendered" && (READERS.has(name) || name === "cd" || name === "pushd")) {
      return refuse(
        "rendered-config",
        shown,
        `\`${name}\` would read a rendered config file, which has its secrets filled in.`,
        "Hand the file's path to the command that needs it; read the template, which holds placeholders, to see its shape.",
      );
    }
    if (
      FILE_READERS.has(name) &&
      !text.startsWith("-") &&
      CREDENTIAL_FILES.some((pattern) => pattern.test(text))
    ) {
      return refuse(
        "credential-file",
        shown,
        `\`${name}\` would put a credential file in this tool result.`,
        USE_WRAPPER,
      );
    }
  }
  return null;
}

function judgeRedirect(redirect: Redirect, ctx: Context): Refusal | null {
  if (redirect.word === null || redirect.word === undefined) {
    return refuse(
      "unreadable-command",
      redirect.op,
      "a redirect's target could not be read, so the guard cannot tell what it opens.",
      "Rewrite the redirect with a plain file name.",
    );
  }
  const target = textOf(redirect.word);
  if (INPUT_OPS.has(redirect.op)) {
    const hit = pathHit(target, ctx);
    if (hit?.kind === "askpass") {
      return refuse(
        "askpass-pane",
        `${redirect.op} ${target}`.slice(0, 80),
        ASKPASS_WHY,
        ASKPASS_INSTEAD,
      );
    }
    if (hit !== undefined) {
      return refuse(
        hit.kind === "store" ? "keyring-files" : "rendered-config",
        `${redirect.op} ${target}`.slice(0, 80),
        "this feeds a protected file to a command.",
        USE_WRAPPER,
      );
    }
  }
  return null;
}

function fd3ToOutput(redirect: Redirect): boolean {
  return (
    redirect.n?.value === "3" &&
    OUTPUT_OPS.has(redirect.op) &&
    FD3_TARGETS.has(textOf(redirect.word))
  );
}

/** Each statement's own call or, for a compound command, nothing: its children are statements too. */
function callOf(stmt: Stmt): CallExprNode | null {
  return stmt.cmd?.type === "CallExpr" ? stmt.cmd : null;
}

/** What one layer of a wrapper chain runs, and the commands inside it: a runner's own command, and
 * the body of a `sh -c`, which is judged as a script of its own. */
async function judgeLayer(
  layer: UnwrappedCall,
  call: CallExprNode,
  ctx: Context,
  exempt: Set<string>,
): Promise<Refusal | null> {
  const seen = effective(layer);
  const refusal = seen === null ? null : judgeCall(seen.name, seen.args, ctx);
  if (refusal !== null) {
    return refusal;
  }
  if (seen !== null) {
    for (const at of innerStarts(seen.name, seen.args)) {
      const inner = await judgeChain(
        { ...call, assigns: [], args: seen.args.slice(at) },
        ctx,
        exempt,
      );
      if (inner !== null) {
        return inner;
      }
    }
  }
  if (layer.kind === "wrapped-script") {
    exempt.add(layer.script);
    return judgeSource(layer.script, { ...ctx, depth: ctx.depth + 1 });
  }
  return null;
}

/** One call, through its wrapper chain. */
/** qsm-usage's output filter puts `rtk` in front of a command before this guard may read it:
 * `rtk cat .env` runs `cat .env`, so the guard judges the command after it. */
const rtkInner: CustomWrapperResolver = ({ cmd }) =>
  nameOf(cmd) === "rtk" ? { innerArgIndex: 0 } : undefined;

async function judgeChain(
  call: CallExprNode,
  ctx: Context,
  exempt: Set<string>,
): Promise<Refusal | null> {
  for (const layer of await unwrapDeepParsed(call, parseBash, { wrapperResolver: rtkInner })) {
    const refusal = await judgeLayer(layer, call, ctx, exempt);
    if (refusal !== null) {
      return refusal;
    }
  }
  return null;
}

/** After `cd <dir>` the relative words of later commands are read against that directory. */
function followCd(call: CallExprNode, ctx: Context): void {
  const first = call.args[0];
  // An assignment-only statement (`A=1`) has no words, so it names no command.
  const name = first === undefined ? "" : nameOf(wordToLit(first) ?? "");
  if (name !== "cd" && name !== "pushd") {
    return;
  }
  const target = call.args[1] === undefined ? undefined : textOf(call.args[1]);
  if (target === undefined || target.startsWith("-")) {
    ctx.cwd.at = undefined;
    return;
  }
  const spelled = expand(target, ctx.env);
  const base = spelled.startsWith("/") ? "" : ctx.cwd.at;
  ctx.cwd.at = base === undefined ? undefined : normalizePath(`${base}/${spelled}`);
}

async function judgeFile(ast: ShellFile, ctx: Context): Promise<Refusal | null> {
  const stmts = findAll(ast, "Stmt");
  const redirected = ctx.fd3Out || stmts.some((stmt) => stmt.redirs.some(fd3ToOutput));
  const inner: Context = { ...ctx, fd3Out: redirected };
  const exempt = new Set<string>();

  for (const stmt of stmts) {
    for (const redirect of stmt.redirs) {
      const refusal = judgeRedirect(redirect, inner);
      if (refusal !== null) {
        return refusal;
      }
    }
    const call = callOf(stmt);
    if (call === null) {
      continue;
    }
    const refusal = await judgeChain(call, inner, exempt);
    if (refusal !== null) {
      return refusal;
    }
    followCd(call, inner);
    const heredoc = stmt.redirs.find((r) => r.hdoc !== null);
    const first = call.args[0];
    if (
      heredoc?.hdoc &&
      first !== undefined &&
      INTERPRETERS.test(basename(wordToLit(first) ?? "")) &&
      KEYRING_LIBRARY.test(textOf(heredoc.hdoc))
    ) {
      return refuse(
        "keyring-library",
        "interpreter with a heredoc",
        "a script that uses a keyring library reads a stored credential into this tool result.",
        USE_WRAPPER,
      );
    }
  }
  return judgeQuotes(ast, exempt);
}

/** A placeholder inside single quotes is not substituted as the shell reads it: the value would be
 * typed as the text `"$QSM_SECRET_<ID>"`. The script of a `sh -c` is the exception, judged on its own. */
function judgeQuotes(ast: ShellFile, exempt: ReadonlySet<string>): Refusal | null {
  for (const quoted of findAll(ast, "SglQuoted")) {
    if (!exempt.has(quoted.value) && placeholderIds(quoted.value).length > 0) {
      return refuse(
        "single-quoted-placeholder",
        `'${quoted.value}'`.slice(0, 80),
        "a placeholder inside single quotes is never replaced, so the command would get the placeholder text.",
        'Put it in double quotes ("...") or leave it bare.',
      );
    }
  }
  return null;
}

async function parseBash(source: string): Promise<ShellFile> {
  return parse(source, "bash");
}

async function judgeSource(source: string, ctx: Context): Promise<Refusal | null> {
  if (ctx.depth > MAX_DEPTH) {
    return refuse(
      "unreadable-command",
      source.slice(0, 80),
      `shells nested deeper than ${MAX_DEPTH} levels cannot be checked.`,
      "Write the inner command to a script and run that.",
    );
  }
  let ast: ShellFile;
  try {
    ast = await parseBash(source);
  } catch (error) {
    if (error instanceof ParseSyntaxError || error instanceof ParseSizeError) {
      return refuse(
        "unreadable-command",
        source.slice(0, 80),
        `the guard cannot read this command (${error.message.slice(0, 120)}), so it cannot tell whether it reads a credential.`,
        "Rewrite it in plain POSIX or bash syntax, or put it in a script file.",
      );
    }
    throw error;
  }
  // A path variable with an operator needs a `${`; most commands have none, so skip the tree walk.
  const parameter = source.includes("${") ? judgeParameters(ast) : null;
  return parameter ?? (await judgeFile(ast, ctx));
}

/** The refusal for a Bash command, or null when nothing in it reads a stored value. */
export async function guardCommand(command: string, env: PathEnv): Promise<Refusal | null> {
  return judgeSource(command, {
    cwd: {},
    env,
    roots: [...protectedRoots(env), ...askpassRoot(env)],
    fd3Out: false,
    depth: 0,
  });
}
