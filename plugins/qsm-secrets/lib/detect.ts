// Where the secrets in a text are. A captured value is masked as a substring in every later tool
// result and transcript, so a false positive is not only a vault entry: `string` captured would
// turn every `stringify` the agent reads into a placeholder. The capture still prefers recall where
// a value can be one, and refuses what is plainly code, prose, a path or a reference. A block or a
// known shape always wins; a value after a credential name is a secret unless it is plainly not a
// value; a token with no shape of its own is a secret when it is nothing else (a path, a name, a
// word, a hash, an id, hex) and as random as its alphabet and length allow.

import { blockSpans, type Span, shapeSpans } from "../../../lib/secret-shapes.ts";

type Range = Pick<Span, "start" | "end">;

const BARE_TOKEN_MIN = 32;
/** A value after a credential name counts from here, whatever its mix: a short token is a token. */
const CREDENTIAL_VALUE_MIN = 6;
/** Shannon entropy over the entropy a random token of the same length and alphabet would show. */
const RANDOMNESS_FLOOR = 0.8;
/** How far back a public key's type or a hash's name can sit before the run it names. */
const NAMED_WINDOW = 48;
/** Decoded base64 shorter than this is not judged as a token of its own. */
const DECODED_TOKEN_MIN = 16;
/** English and Czech words are about two-fifths vowels; a random letter run about one-fifth. */
const WORD_VOWEL_SHARE = 0.35;
const PRINTABLE_SHARE = 0.9;
const MIN_SEPARATORS = 3;
const SEPARATOR_RATIO = 0.1;
const IDENTIFIER_PIECE = 4;

// Everything a token, a path or a dotted name is made of; a run is judged whole, never in part.
const RUN = /[A-Za-z0-9_+/=.~-]+/g;
const PLACEHOLDER = /\{\{secret:[^}]*\}\}(?:…[\w-]{4})?/g;

// A name that says what follows is a credential. The name is split into its parts (`GITHUB_TOKEN`,
// `clientSecret`) and one part must be a credential word, in English or Czech, so
// `authorization_mode` and `passwordless` are not. Name and value sit on one line.
const NAME = String.raw`(?<![\p{L}\p{N}_-])([\p{L}\p{N}_-]+)["']?`;
const ASSIGN = String.raw`[ \t]*(?::=|=>|[:=])[ \t]*`;
const JOIN = String.raw`[ \t]+(?:is|je)[ \t]+`;
// A quoted value runs to its closing quote on the same line; any other to the next blank.
// It is matched in a lookahead, so a value that holds `name: value` of its own (JSON) is read too.
const VALUE = String.raw`(?=(?:"([^"\n]*)"|'([^'\n]*)'|\x60([^\x60\n]*)\x60|["'\x60]?(\S+)))`;

interface Pattern {
  readonly re: RegExp;
  /** Which part of group 1 must be a credential word: any part of a name, the last of a flag
   * (`--password`, not `--auth-type`), or none when the pattern itself says credential. */
  readonly name: "any" | "last" | "none";
  /** Whether the value must look random: after a word of prose, a plain word is prose. */
  readonly random: boolean;
}

const PATTERNS: readonly Pattern[] = [
  { re: new RegExp(`${NAME}${ASSIGN}${VALUE}`, "dgu"), name: "any", random: false },
  { re: new RegExp(`${NAME}${JOIN}${VALUE}`, "dgu"), name: "any", random: true },
  { re: new RegExp(String.raw`(?<![\w-])--([\w-]+)=${VALUE}`, "dgu"), name: "last", random: false },
  {
    re: new RegExp(String.raw`(?<![\w-])--([\w-]+)[ \t]+${VALUE}`, "dgu"),
    name: "last",
    random: true,
  },
  {
    // netrc: `machine` or `login` earlier on the line says what `password` is.
    re: new RegExp(String.raw`\b(?:machine|login)[ \t]+\S.*?[ \t](password)[ \t]+${VALUE}`, "dgu"),
    name: "none",
    random: false,
  },
  {
    re: new RegExp(String.raw`^[ \t]*(password)[ \t]+${VALUE}`, "dgmu"),
    name: "none",
    random: true,
  },
  {
    re: new RegExp(String.raw`(?<![\p{L}\p{N}_-])(bearer)[ \t]+${VALUE}`, "dgiu"),
    name: "none",
    random: true,
  },
];

const NAME_PART = /\p{Lu}?[\p{Ll}\p{N}]+|\p{Lu}+(?!\p{Ll})/gu;
const CREDENTIAL_PART =
  /(?:secret|token|passw(?:or)?d|pwd|passphrase|credentials?|heslo|kl[ií][cč]|tajn[eé])$|^(?:auth|pass)$/u;
const CREDENTIAL_PAIRS = /^(?:api|access|private)key$/;
/** `STRIPE_KEY`, `ENCRYPTION_KEY`: a key only as the last part of an UPPER_SNAKE name. */
const UPPER_KEY = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_KEY$/;
const NOT_SECRET_KEY = /(?:^|_)(?:PUBLIC|PRIMARY|FOREIGN)_KEY$/;

// What is plainly not a value: a literal, a template, a stopword, a type name, a reference to a
// variable or to code, a path, a URL, an SSH key type, a YAML tag, a slug of five words or more.
const NOT_A_VALUE =
  /^(?:true|false|null|nil|none|changeme|example|your-[\p{L}\p{N}-]+|basic|bearer|digest|oauth2?|oidc|saml|ntlm|kerberos|negotiate)$/iu;
const TYPE_NAME =
  /^(?:string|number|boolean|bigint|any|unknown|object|undefined|void|never|int|integer|float|double|str|bool|bytes|required|optional)(?:\[\])?$/i;
const TEMPLATE = /^(?:<[^<>]*>|\{\{[^{}]*\}\}|\{[^{}]*\}|%\(\w+\)[sd])$/;
// A reference to code: `$X`, `x.y` of identifier words or constants (`process.env.API_SECRET`,
// `settings.SECRET_KEY`), a call `f()` or `f(x)`; not `Welcome.2024`, `Summer.Sun42`, `Abc(2024)`.
const SEGMENT = String.raw`(?:[a-z_][A-Za-z_]*|[A-Z][A-Z0-9_]*)`;
const REFERENCE = new RegExp(
  String.raw`^(?:\$|${SEGMENT}\.${SEGMENT}(?![\w$])|[A-Za-z_]\w*\((?:\)|[A-Za-z_'"$]))`,
);
/** A path: `~/`, `./`, `../`, or a `/` with a second `/` after it (one leading slash is base64). */
const PATH = /^(?:~\/|\.\.?\/|\/[^/\s]+\/)/;
// A name in code or config: camelCase, PascalCase, UPPER_SNAKE, a lowercase slug, a file name.
const IDENTIFIER = [/^[a-z]+(?:[A-Z][a-z]+)+$/, /^(?:[A-Z][a-z]+)+$/];
// A name in config: UPPER_SNAKE, a file name, a lowercase slug. A generated password takes these
// shapes too, so they are refused only when no segment mixes letters and digits and the name before
// them is no password word.
const CONFIG_NAME = [
  /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/,
  /^[\w-]+(?:\.[a-z]{1,5})+$/,
  /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+$/,
];
/** A flag or a shell default (`--username`, `-postgres`); a random token may start with `-` too. */
const FLAG = /^--?[a-z][a-z-]*$/;
const PASSWORD_PART = /(?:passw(?:or)?d|pwd|passphrase|heslo)$|^pass$/;
const URL = /^[a-z][a-z0-9+.-]*:\/\//i;
const SSH_TYPE_VALUE = /^(?:ssh-(?:rsa|dss|ed25519)|ecdsa-sha2-|sk-ssh-|sk-ecdsa-)/;
const YAML_TAG = /^![a-z]+$/;
const SLUG = /^[a-z]+(?:[-_][a-z]+){4,}$/;
const REPEATED = /^(.)\1*$/su;
const SEQUENCES = ["abcdefghijklmnopqrstuvwxyz", "0123456789"];
const TRAILING = /[.,;:'"\u0060]$/;
const CLOSERS: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{" };

const SSH_KEY_TYPE = /(?:ssh|ecdsa-sha2|sk-ssh|sk-ecdsa-sha2)-[a-z0-9@.-]*\s+$/;
const HASH_PREFIX = /^(?:sha(?:1|224|256|384|512)|md5)[-:_]/i;
const HASH_BEFORE = /(?:sha(?:1|224|256|384|512)|md5):$/i;
const ID_PREFIX =
  /^(?:session|msg|toolu|req|cap|file|call|run|thread|resp|chatcmpl|agent|task|batch)[_-]/;
const HEX = /^[0-9a-f]+$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const VOWELS = /[aeiouy]/gi;

function entropy(token: string): number {
  const counts = new Map<string, number>();
  for (const char of token) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let bits = 0;
  for (const count of counts.values()) {
    bits -= (count / token.length) * Math.log2(count / token.length);
  }
  return bits;
}

/** The alphabet a token was drawn from, from the character classes it holds. */
function alphabetSize(token: string): number {
  let size = 0;
  for (const [pattern, add] of [
    [/[a-z]/, 26],
    [/[A-Z]/, 26],
    [/\d/, 10],
  ] as const) {
    size += pattern.test(token) ? add : 0;
  }
  return size + ["-", "_", "+", "/"].filter((char) => token.includes(char)).length;
}

/** The measured entropy over what a random token of this length and alphabet averages (Miller-Madow). */
function randomness(token: string): number {
  const size = alphabetSize(token);
  const expected = Math.log2(size) - (size - 1) / (2 * token.length * Math.LN2);
  return entropy(token) / expected;
}

/** The text base64 decodes to, or null when it decodes to bytes that are not text. */
function decodedText(token: string): string | null {
  if (!BASE64.test(token)) {
    return null;
  }
  const bytes = Buffer.from(token, "base64");
  const printable = bytes.filter((b) => (b >= 0x20 && b < 0x7f) || b === 0x0a).length;
  return bytes.length > 0 && printable / bytes.length >= PRINTABLE_SHARE
    ? bytes.toString("latin1")
    : null;
}

/** Many separators close together: a name, a path, a slug. */
function isNamelike(token: string): boolean {
  const separators = token.split(/[-_/]/).length - 1;
  return separators >= MIN_SEPARATORS && separators / token.length > SEPARATOR_RATIO;
}

/** camelCase, PascalCase and a slug break into long words; a random mixed-case token into letter
 * runs of one or two. A single-case run of letters and digits has no humps and no separators, so
 * it is judged as a word or as random instead (a random a-z token, a base32 seed). */
function isCamelWords(token: string): boolean {
  if (/^(?:[a-z0-9]+|[A-Z0-9]+)$/.test(token)) {
    return false;
  }
  const words = token.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g) ?? [];
  return words.length > 0 && words.join("").length / words.length >= IDENTIFIER_PIECE;
}

/** Letters in one case with as many vowels as words have: run-together words, not a random run. */
function isWordlike(token: string): boolean {
  return (
    /^(?:[a-z]+|[A-Z]+)$/.test(token) &&
    (token.match(VOWELS) ?? []).length / token.length >= WORD_VOWEL_SHARE
  );
}

/** What a decoded base64 run hides: a block or a shape by its kind, or a random token of its own;
 * null when it is text, JSON, a URL or a path. */
function hiddenKind(decoded: string): string | null {
  const inner = blockSpans(decoded)[0] ?? shapeSpans(decoded)[0];
  if (inner !== undefined) {
    return inner.kind;
  }
  const plain = !/\s/.test(decoded) && !/^[[{]/.test(decoded);
  return plain &&
    !URL.test(decoded) &&
    !PATH.test(decoded) &&
    decoded.length >= DECODED_TOKEN_MIN &&
    randomness(decoded) >= RANDOMNESS_FLOOR
    ? "random-token"
    : null;
}

/** The kind of a long run with no shape, or null when it is something else: hex (a digest, an id,
 * a commit), a UUID, an id, a hash, a name, a word, or not random enough for its alphabet. Base64
 * of text is judged by what it decodes to. */
function bareKind(token: string): string | null {
  if (HEX.test(token) || UUID.test(token)) {
    return null;
  }
  const decoded = decodedText(token);
  if (decoded !== null) {
    return hiddenKind(decoded);
  }
  const other =
    ID_PREFIX.test(token) ||
    HASH_PREFIX.test(token) ||
    isNamelike(token) ||
    isCamelWords(token) ||
    isWordlike(token);
  return !other && randomness(token) >= RANDOMNESS_FLOOR ? "random-token" : null;
}

function intersects(a: Range, b: Range): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Where the value of `NAME=value` starts in a run: after the first `=` that is not padding. */
function valueStart(run: string): number {
  let end = run.length;
  while (end > 0 && run[end - 1] === "=") {
    end -= 1;
  }
  return run.slice(0, end).indexOf("=") + 1;
}

/** The long runs that are none of: a path, a URL, a dotted name; each judged as a bare token. A public
 * key is random-looking base64 and not a secret. */
function bareRuns(text: string): Span[] {
  return [...text.matchAll(RUN)].flatMap((m) => {
    const offset = valueStart(m[0]);
    const start = m.index + offset;
    const token = m[0].slice(offset);
    const plain = !(token.includes(".") || token.startsWith("/") || token.startsWith("~"));
    if (!plain || token.length < BARE_TOKEN_MIN) {
      return [];
    }
    // A public key and a hash named as one (`sha256:<hex>`) say what follows is not a secret.
    const before = text.slice(Math.max(0, m.index - NAMED_WINDOW), m.index);
    const kind = SSH_KEY_TYPE.test(before) || HASH_BEFORE.test(before) ? null : bareKind(token);
    return kind === null ? [] : [{ start, end: start + token.length, kind }];
  });
}

/** A run of the alphabet or of the digits, wrapping round: `abcdefgh`, `12345678`, `7890123`. */
function isSequence(value: string): boolean {
  const lower = value.toLowerCase();
  return SEQUENCES.some((seq) =>
    seq.repeat(Math.ceil(lower.length / seq.length) + 1).includes(lower),
  );
}

/** What no credential is: a literal, a template, a type, a reference, a path, a URL, a name in
 * code, a flag. */
function isPlainlyNotAValue(value: string): boolean {
  return (
    FLAG.test(value) ||
    [
      NOT_A_VALUE,
      TYPE_NAME,
      TEMPLATE,
      REFERENCE,
      PATH,
      URL,
      SSH_TYPE_VALUE,
      YAML_TAG,
      REPEATED,
      ...IDENTIFIER,
    ].some((pattern) => pattern.test(value)) ||
    isSequence(value)
  );
}

/** A name in config (`SECRETS_BACKEND`, `creds-2024.json`, `tls-secret`) with no segment that
 * mixes letters and digits, as `k3j9x-q8m2z` does. */
function isConfigName(value: string): boolean {
  const mixed = value.split(/[-_.]/).some((seg) => /[A-Za-z]/.test(seg) && /\d/.test(seg));
  return !mixed && (SLUG.test(value) || CONFIG_NAME.some((pattern) => pattern.test(value)));
}

/** A digit, a capital after the first letter, or a symbol: not a word of prose. */
function looksRandom(value: string): boolean {
  return /\d/.test(value) || /.\p{Lu}/u.test(value) || /[^\p{L}\p{N}]/u.test(value);
}

/** `STRIPE_KEY`, `ENCRYPTION_KEY`: an UPPER_SNAKE name ending in `_KEY` that is no column key. */
function isUpperKey(name: string): boolean {
  return UPPER_KEY.test(name) && !NOT_SECRET_KEY.test(name);
}

/** Whether one of the parts, or two together (`api_key`), is a credential word. */
function saysCredential(parts: readonly string[]): boolean {
  const pairs = parts.flatMap((part, at) => (at > 0 ? [`${parts[at - 1] ?? ""}${part}`] : []));
  return [...parts, ...pairs].some(
    (part) => CREDENTIAL_PART.test(part) || CREDENTIAL_PAIRS.test(part),
  );
}

/** A name's parts in lower case: `GITHUB_TOKEN` is `github`, `token`; `clientSecret` is `client`,
 * `secret`. */
function nameParts(name: string): string[] {
  return (name.match(NAME_PART) ?? []).map((part) => part.toLowerCase());
}

/** Whether a flag's parts say credential: its last part, or its last two together (`--api-key`). */
function flagSaysCredential(parts: readonly string[]): boolean {
  return saysCredential(parts.slice(-1)) || CREDENTIAL_PAIRS.test(parts.slice(-2).join(""));
}

/** An unquoted value less what closes the sentence or the code around it: a trailing comma, quote
 * or an unbalanced bracket. */
function trimmed(value: string): string {
  let out = value;
  for (;;) {
    const last = out.at(-1) ?? "";
    const opener = CLOSERS[last];
    if (TRAILING.test(out)) {
      out = out.slice(0, -1);
    } else if (opener !== undefined && out.split(opener).length < out.split(last).length) {
      out = out.slice(0, -1);
    } else {
      return out;
    }
  }
}

/** Whether what stands before the value says credential: any part of a name, the last part of a
 * flag, an UPPER_SNAKE `_KEY`, or the pattern itself (netrc, Bearer). */
function namedCredential(where: Pattern["name"], said: string): boolean {
  const parts = nameParts(said);
  return (
    where === "none" ||
    isUpperKey(said) ||
    (where === "last" ? flagSaysCredential(parts) : saysCredential(parts))
  );
}

/** Whether a value after a credential name is kept: long enough, not plainly something else, a
 * name in config only assigned to a password word (never after prose: `heslo je HESLO_DB` is
 * prose), and random-looking where prose stands before it. */
function isKept(pattern: Pattern, said: string, value: string): boolean {
  return (
    value.length >= CREDENTIAL_VALUE_MIN &&
    !isPlainlyNotAValue(value) &&
    ((!pattern.random && nameParts(said).some((part) => PASSWORD_PART.test(part))) ||
      !isConfigName(value)) &&
    (!pattern.random || looksRandom(value))
  );
}

/** Where the value of a credential match sits: the quoted text inside its quotes, or an unquoted
 * run less its trailing punctuation; null when the match holds none. */
function valueOf(m: RegExpExecArray): Range | null {
  const group = [2, 3, 4].find((g) => m[g] !== undefined) ?? 5;
  const raw = m[group];
  const at = m.indices?.[group]?.[0];
  if (raw === undefined || at === undefined) {
    return null;
  }
  return { start: at, end: at + (group === 5 ? trimmed(raw) : raw).length };
}

/** Every value after a credential name, a credential flag, a netrc `password` or `Bearer` that is
 * not plainly something else; after a word of prose it must also look random. */
function credentialSpans(text: string): Span[] {
  return PATTERNS.flatMap((pattern) =>
    [...text.matchAll(pattern.re)].flatMap((m) => {
      const said = m[1] ?? "";
      const at = valueOf(m);
      const kept =
        at !== null &&
        namedCredential(pattern.name, said) &&
        isKept(pattern, said, text.slice(at.start, at.end));
      return kept ? [{ ...at, kind: "credential-value" }] : [];
    }),
  );
}

/** Every secret in the text, in order. The passes run from the surest to the weakest, and a pass
 * skips any text an earlier one claimed, so a block's lines are never judged one by one; a
 * placeholder is skipped by every pass and never captured again. */
export function secretSpans(text: string): Span[] {
  const placeholders: Range[] = [...text.matchAll(PLACEHOLDER)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
  const claimed: Span[] = [];
  for (const pass of [blockSpans, shapeSpans, credentialSpans, bareRuns]) {
    for (const span of pass(text).toSorted((a, b) => a.start - b.start || b.end - a.end)) {
      const free = (taken: Range): boolean => !intersects(taken, span);
      if (placeholders.every(free) && claimed.every(free)) {
        claimed.push(span);
      }
    }
  }
  return claimed.toSorted((a, b) => a.start - b.start);
}
