// Finds secrets in a prompt, hands each new value to a store, and swaps it for its id.

import { randomBytes } from "node:crypto";
import { type Span, shapeSpans } from "../../../lib/secret-shapes.ts";

const BARE_TOKEN_MIN = 32;
const ENTROPY_FLOOR = 3.5;
const SUFFIX_MIN_LENGTH = 20;
const SUFFIX_LENGTH = 4;
const BARE_TOKEN = new RegExp(`[A-Za-z0-9_-]{${BARE_TOKEN_MIN},}`, "g");

interface Captured {
  readonly id: string;
  /** The last characters of the value; null when the value is too short to show any. */
  readonly suffix: string | null;
}

export interface Capture {
  readonly text: string;
  readonly captured: Captured[];
}

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

// ponytail: a token needs a digit and must not be hex digits and hyphens alone, so a function
// name, a commit hash or a UUID is not captured; a hex-only secret slips through. Upgrade path: a
// per-shape list for hex keys.
function isBareSecret(token: string): boolean {
  return /\d/.test(token) && !/^[0-9a-f-]+$/i.test(token) && entropy(token) >= ENTROPY_FLOOR;
}

function bareSpans(text: string): Span[] {
  return [...text.matchAll(BARE_TOKEN)]
    .filter((m) => isBareSecret(m[0]))
    .map((m) => ({ start: m.index, end: m.index + m[0].length }));
}

/** Known shapes plus the entropy floor, in text order; where two overlap the earlier, longer wins. */
function secretSpans(text: string): Span[] {
  const all = [...shapeSpans(text), ...bareSpans(text)].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  const kept: Span[] = [];
  for (const span of all) {
    if (span.start >= (kept.at(-1)?.end ?? 0)) {
      kept.push(span);
    }
  }
  return kept;
}

/**
 * The text with each secret replaced by `{{secret:<id>}}` and, for a long one, its last four
 * characters. `store` is called once per distinct value, and never when the text holds none.
 */
export function captureSecrets(text: string, store: (id: string, value: string) => void): Capture {
  const ids = new Map<string, Captured>();
  let out = "";
  let at = 0;
  for (const { start, end } of secretSpans(text)) {
    const value = text.slice(start, end);
    let found = ids.get(value);
    if (found === undefined) {
      found = {
        id: `cap_${randomBytes(6).toString("hex")}`,
        suffix: value.length >= SUFFIX_MIN_LENGTH ? value.slice(-SUFFIX_LENGTH) : null,
      };
      store(found.id, value);
      ids.set(value, found);
    }
    out += `${text.slice(at, start)}{{secret:${found.id}}}${found.suffix === null ? "" : `…${found.suffix}`}`;
    at = end;
  }
  return { text: out + text.slice(at), captured: [...ids.values()] };
}
