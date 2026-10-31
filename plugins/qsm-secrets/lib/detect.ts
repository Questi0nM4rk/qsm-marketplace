// Where the secrets in a text are. Recall comes first: a miss stays in a transcript for good, a
// false positive is one vault entry the person removes, so a value is captured unless it is plainly
// not one. A block or a known shape always wins; a value after a credential name is a secret unless
// it is a template or a stopword; a token with no shape of its own is a secret when it is nothing
// else (a path, a name, a hash, an id, base64 of text) and as random as its alphabet and length allow.

import { blockSpans, type Span, shapeSpans } from "../../../lib/secret-shapes.ts";

type Range = Pick<Span, "start" | "end">;

const BARE_TOKEN_MIN = 32;
/** A value after a credential name counts from here, whatever its mix: a short token is a token. */
const CREDENTIAL_VALUE_MIN = 6;
/** Shannon entropy over the entropy a random token of the same length and alphabet would show. */
const RANDOMNESS_FLOOR = 0.8;
/** A git commit: hex of exactly this length is an id this machine shows every turn. */
const COMMIT_LENGTH = 40;
const HEX_ALPHABET = 16;
/** How far back a public key's type or a hash's name can sit before the run it names. */
const NAMED_WINDOW = 48;
const PRINTABLE_SHARE = 0.9;
const MIN_SEPARATORS = 3;
const SEPARATOR_RATIO = 0.1;
const IDENTIFIER_PIECE = 4;

// Everything a token, a path or a dotted name is made of; a run is judged whole, never in part.
const RUN = /[A-Za-z0-9_+/=.~-]+/g;
const PLACEHOLDER = /\{\{secret:[^}]*\}\}(?:…[\w-]{4})?/g;
// A name that says what follows is a credential. The name is split into its parts (`GITHUB_TOKEN`,
// `clientSecret`) and one part must be a credential word, in English or Czech, so
// `authorization_mode` and `passwordless` are not. The value runs to the next space or quote.
const VALUE = String.raw`["'\x60]?([^\s"'\x60]{${CREDENTIAL_VALUE_MIN},})`;
const NAMED = new RegExp(
  String.raw`(?<![\p{L}\p{N}_-])([\p{L}\p{N}_-]+)["']?(?:\s*(?::=|=>|[:=])\s*|\s+(?:is|je)\s+)${VALUE}`,
  "gu",
);
const BEARER = new RegExp(String.raw`(?<![\p{L}\p{N}_-])bearer\s+${VALUE}`, "giu");
const NAME_PART = /\p{Lu}?[\p{Ll}\p{N}]+|\p{Lu}+(?!\p{Ll})/gu;
const CREDENTIAL_PART =
  /(?:secret|token|passw(?:or)?d|pwd|passphrase|credentials?|heslo|kl[ií][cč]|tajn[eé])$|^auth$/u;
const CREDENTIAL_PAIRS = /^(?:api|access|private)key$/;
// What is plainly not a value, and the only values a credential name does not make secret: a
// literal, a template, a stopword; a repeated character and a sequential run are judged in code.
const NOT_A_VALUE = /^(?:true|false|null|changeme|example|your-[\p{L}\p{N}-]+)$/iu;
const TEMPLATE = /^(?:<[^<>]*>|\$\{[^{}]*\}|\{\{[^{}]*\}\}|\{[^{}]*\})$/;
const REPEATED = /^(.)\1*$/su;
const SEQUENCES = ["abcdefghijklmnopqrstuvwxyz", "0123456789"];
const SSH_KEY_TYPE = /(?:ssh|ecdsa-sha2|sk-ssh|sk-ecdsa-sha2)-[a-z0-9@.-]*\s+$/;
const HASH_PREFIX = /^(?:sha(?:1|224|256|384|512)|md5)[-:_]/i;
const ID_PREFIX =
  /^(?:session|msg|toolu|req|cap|file|call|run|thread|resp|chatcmpl|agent|task|batch)[_-]/;
const HEX = /^[0-9a-f]+$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_BEFORE = /(?:sha(?:1|224|256|384|512)|md5):$/i;
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

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
function randomness(token: string, size: number): number {
  const expected = Math.log2(size) - (size - 1) / (2 * token.length * Math.LN2);
  return entropy(token) / expected;
}

/** Decoded, the bytes are text: a sentence in base64 looks random and is not. */
function decodesToText(token: string): boolean {
  if (!BASE64.test(token)) {
    return false;
  }
  const bytes = Buffer.from(token, "base64");
  const printable = bytes.filter((b) => (b >= 0x20 && b < 0x7f) || b === 0x0a).length;
  return bytes.length > 0 && printable / bytes.length >= PRINTABLE_SHARE;
}

/** Many separators close together: a name, a path, a slug. */
function isNamelike(token: string): boolean {
  const separators = token.split(/[-_/]/).length - 1;
  return separators >= MIN_SEPARATORS && separators / token.length > SEPARATOR_RATIO;
}

/** camelCase and PascalCase break into long words; a random token, hex included, into letter runs
 * of one or two. Digits are not words, so a long digit run cannot make a token look like a name. */
function isCamelWords(token: string): boolean {
  const words = token.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g) ?? [];
  return words.length > 0 && words.join("").length / words.length >= IDENTIFIER_PIECE;
}

/** What every judged token is not: an id, a hash, a name, a path, base64 of text. */
function isSomethingElse(token: string): boolean {
  return (
    ID_PREFIX.test(token) ||
    HASH_PREFIX.test(token) ||
    isNamelike(token) ||
    isCamelWords(token) ||
    decodesToText(token)
  );
}

/** A long run with no shape: none of the above, no commit and no UUID, and random enough in its
 * own alphabet, which for hex is sixteen characters. */
function isBareSecret(token: string): boolean {
  const hex = HEX.test(token);
  return (
    !isSomethingElse(token) &&
    !UUID.test(token) &&
    !(hex && token.length === COMMIT_LENGTH) &&
    randomness(token, hex ? HEX_ALPHABET : alphabetSize(token)) >= RANDOMNESS_FLOOR
  );
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
    const named = SSH_KEY_TYPE.test(before) || HASH_BEFORE.test(before);
    return !named && isBareSecret(token)
      ? [{ start, end: start + token.length, kind: "random-token" }]
      : [];
  });
}

/** A run of the alphabet or of the digits, wrapping round: `abcdefgh`, `12345678`, `7890123`. */
function isSequence(value: string): boolean {
  const lower = value.toLowerCase();
  return SEQUENCES.some((seq) =>
    seq.repeat(Math.ceil(lower.length / seq.length) + 1).includes(lower),
  );
}

/** What no credential is: `true`, a template, `changeme`, one character repeated, a sequence. */
function isPlainlyNotAValue(value: string): boolean {
  return (
    NOT_A_VALUE.test(value) || TEMPLATE.test(value) || REPEATED.test(value) || isSequence(value)
  );
}

/** Whether one part of a name, or two parts together (`api_key`), is a credential word. */
function isCredentialName(name: string): boolean {
  const parts = (name.match(NAME_PART) ?? []).map((part) => part.toLowerCase());
  const pairs = parts.flatMap((part, at) => (at > 0 ? [`${parts[at - 1] ?? ""}${part}`] : []));
  return [...parts, ...pairs].some(
    (part) => CREDENTIAL_PART.test(part) || CREDENTIAL_PAIRS.test(part),
  );
}

/** Every value after a credential name or `Bearer` that is not plainly something else. */
function credentialSpans(text: string): Span[] {
  const named = [...text.matchAll(NAMED)].filter((m) => isCredentialName(m[1] ?? ""));
  return [...named, ...text.matchAll(BEARER)].flatMap((m) => {
    const value = m.at(-1);
    if (value === undefined) {
      return [];
    }
    const token = value.replace(/[.,;:]+$/, "");
    const start = m.index + m[0].length - value.length;
    return token.length >= CREDENTIAL_VALUE_MIN && !isPlainlyNotAValue(token)
      ? [{ start, end: start + token.length, kind: "credential-value" }]
      : [];
  });
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
