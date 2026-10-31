// Where the secrets in a text are. A known shape always wins. A token with no shape of its own is
// a secret only when it is nothing else: not inside a placeholder, not a path, a name, a hash or an
// id, not base64 of text, and as random as its alphabet and length allow.

import { type Span, shapeSpans } from "../../../lib/secret-shapes.ts";

const BARE_TOKEN_MIN = 32;
/** A value after a credential name counts from here, whatever its mix: a short token is a token. */
const CREDENTIAL_VALUE_MIN = 6;
/** Shannon entropy over the entropy a random token of the same length and alphabet would show. */
const RANDOMNESS_FLOOR = 0.9;
const PRINTABLE_SHARE = 0.9;
const MIN_SEPARATORS = 3;
const SEPARATOR_RATIO = 0.1;
const IDENTIFIER_PIECE = 4;

// Everything a token, a path or a dotted name is made of; a run is judged whole, never in part.
const RUN = /[A-Za-z0-9_+/=.~-]+/g;
const PLACEHOLDER = /\{\{secret:[^}]*\}\}(?:…[\w-]{4})?/g;
const BLOCK_BEGIN = /-----BEGIN ([^\r\n-][^\r\n]*?)-----/g;
const PUTTY_KEY = /PuTTY-User-Key-File-\d+:/g;
const PUTTY_MAC = /Private-MAC:[^\r\n]*/;
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
  return size + ["-", "_", "+", "/"].filter((char) => token.includes(char)).length;
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

function intersects(a: Span, b: Span): boolean {
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
    const publicKey = SSH_KEY_TYPE.test(text.slice(0, m.index));
    return plain && !publicKey && token.length >= BARE_TOKEN_MIN && isBareSecret(token)
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

/** What a block's label says it holds; any label is a secret, only its name differs. */
function blockKind(label: string): string {
  if (/PRIVATE KEY(?: BLOCK)?$/.test(label)) {
    return "private-key";
  }
  return label === "OpenVPN Static key V1" ? "openvpn-key" : "pem-block";
}

/** Where a block that never closes ends: the end of the text, less its trailing blank. */
function untilEnd(text: string, from: number): number {
  return Math.max(from, text.trimEnd().length);
}

/** Every armoured block, any label, from its BEGIN line to the END line of the same label or to the
 * end of the text, and every PuTTY key from its header to its Private-MAC line. */
function blockSpans(text: string): Span[] {
  const armoured = [...text.matchAll(BLOCK_BEGIN)].map((m) => {
    const label = m[1] ?? "";
    const close = `-----END ${label}-----`;
    const at = text.indexOf(close, m.index + m[0].length);
    const end = at === -1 ? untilEnd(text, m.index + m[0].length) : at + close.length;
    return { start: m.index, end, kind: blockKind(label) };
  });
  const putty = [...text.matchAll(PUTTY_KEY)].map((m) => {
    const mac = PUTTY_MAC.exec(text.slice(m.index));
    const end =
      mac === null ? untilEnd(text, m.index + m[0].length) : m.index + mac.index + mac[0].length;
    return { start: m.index, end, kind: "private-key" };
  });
  return [...armoured, ...putty];
}

/** Every secret in the text, in order. The passes run from the surest to the weakest, and a pass
 * skips any text an earlier one claimed, so a block's lines are never judged one by one and a
 * placeholder is never captured again. */
export function secretSpans(text: string): Span[] {
  const claimed: Span[] = [...text.matchAll(PLACEHOLDER)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    kind: "placeholder",
  }));
  const found: Span[] = [];
  for (const pass of [blockSpans, shapeSpans, credentialSpans, bareRuns]) {
    for (const span of pass(text).toSorted((a, b) => a.start - b.start || b.end - a.end)) {
      if (!claimed.some((c) => intersects(c, span))) {
        claimed.push(span);
        found.push(span);
      }
    }
  }
  return found.toSorted((a, b) => a.start - b.start);
}
