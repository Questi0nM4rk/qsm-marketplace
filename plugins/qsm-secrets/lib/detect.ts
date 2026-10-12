// Where the secrets in a text are. A known shape always wins. A token with no shape of its own is
// a secret only when it is nothing else: not inside a placeholder, not a path, a name, a hash or an
// id, not base64 of text, and as random as its alphabet and length allow.

import { type Span, shapeSpans } from "../../../lib/secret-shapes.ts";

const BARE_TOKEN_MIN = 32;
const CONTEXT_TOKEN_MIN = 16;
/** Shannon entropy over the entropy a random token of the same length and alphabet would show. */
const RANDOMNESS_FLOOR = 0.9;
/** Hex repeats digits, so its floor is raw bits per character, not a ratio. */
const HEX_ENTROPY_FLOOR = 3;
const PRINTABLE_SHARE = 0.9;
const MIN_SEPARATORS = 3;
const SEPARATOR_RATIO = 0.1;
const IDENTIFIER_PIECE = 4;

// Everything a token, a path or a dotted name is made of; a run is judged whole, never in part.
const RUN = /[A-Za-z0-9_+/=.~-]+/g;
const PLACEHOLDER = /\{\{secret:[^}]*\}\}(?:…[\w-]{4})?/g;
// A name that says what follows is a credential; its value is then judged on a lower bar.
const CONTEXT = new RegExp(
  String.raw`(?<=\b(?:[A-Za-z0-9_-]*(?:secret|token|passw(?:or)?d|pwd|api[_-]?key|access[_-]?key|private[_-]?key|credential|auth)[A-Za-z0-9_-]*\s*[:=]\s*|bearer\s+)["']?)[A-Za-z0-9_+/=.~-]{${CONTEXT_TOKEN_MIN},}`,
  "gi",
);
const HASH_PREFIX = /^(?:sha(?:1|224|256|384|512)|md5)[-:_]/i;
const ID_PREFIX =
  /^(?:session|msg|toolu|req|cap|file|call|run|thread|resp|chatcmpl|agent|task|batch)[_-]/;
const HEX = /^[0-9a-f]+$/i;
const HEX_AND_HYPHENS = /^[0-9a-f-]+$/i;
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

function alphabetSize(token: string): number {
  let size = 0;
  for (const [pattern, add] of [
    [/[a-z]/, 26],
    [/[A-Z]/, 26],
    [/\d/, 10],
  ] as const) {
    size += pattern.test(token) ? add : 0;
  }
  return size + [..."-_+/"].filter((char) => token.includes(char)).length;
}

/** The measured entropy over what a random token of this length and alphabet averages (Miller-Madow). */
function randomness(token: string): number {
  const size = alphabetSize(token);
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

/** camelCase and PascalCase break into long words; a random mixed-case token into runs of one or two. */
function isCamelWords(token: string): boolean {
  const pieces = token.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g) ?? [];
  return pieces.length > 0 && token.length / pieces.length >= IDENTIFIER_PIECE;
}

function classes(token: string): number {
  return [/[a-z]/, /[A-Z]/, /\d/].filter((pattern) => pattern.test(token)).length;
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

/** A long run with no shape: random enough in its own alphabet, and none of the above. */
function isBareSecret(token: string): boolean {
  return (
    /\d/.test(token) &&
    /[A-Za-z]/.test(token) &&
    !HEX_AND_HYPHENS.test(token) &&
    !isSomethingElse(token) &&
    randomness(token) >= RANDOMNESS_FLOOR
  );
}

/** The value after a credential name: a hash-looking hex is a secret here, a name or a word is not. */
function isContextSecret(token: string): boolean {
  if (HEX.test(token)) {
    return entropy(token) >= HEX_ENTROPY_FLOOR;
  }
  return classes(token) >= 2 && !isSomethingElse(token);
}

function intersects(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

/** The long runs that are none of: a path, a URL, a dotted name; each judged as a bare token. */
function bareRuns(text: string): Span[] {
  return [...text.matchAll(RUN)].flatMap((m) => {
    // `NAME=value`: the value after the first `=` that is not padding is the run to judge.
    const equals = m[0].search(/[=](?!=*$)/);
    const start = m.index + equals + 1;
    const token = m[0].slice(equals + 1);
    const plain = !(token.includes(".") || token.startsWith("/") || token.startsWith("~"));
    return plain && token.length >= BARE_TOKEN_MIN && isBareSecret(token)
      ? [{ start, end: start + token.length }]
      : [];
  });
}

function contextSpans(text: string): Span[] {
  return [...text.matchAll(CONTEXT)].flatMap((m) => {
    const token = m[0].replace(/[.,;:]+$/, "");
    const plain = !(token.startsWith("/") || token.startsWith("~") || token.startsWith("."));
    return plain && token.length >= CONTEXT_TOKEN_MIN && isContextSecret(token)
      ? [{ start: m.index, end: m.index + token.length }]
      : [];
  });
}

/** Every secret in the text, in order, none overlapping another or a placeholder. */
export function secretSpans(text: string): Span[] {
  const placeholders = [...text.matchAll(PLACEHOLDER)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
  const all = [...shapeSpans(text), ...contextSpans(text), ...bareRuns(text)]
    .filter((span) => !placeholders.some((p) => intersects(span, p)))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Span[] = [];
  for (const span of all) {
    if (span.start >= (kept.at(-1)?.end ?? 0)) {
      kept.push(span);
    }
  }
  return kept;
}
