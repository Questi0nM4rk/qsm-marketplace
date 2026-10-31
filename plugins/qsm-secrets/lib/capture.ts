// Finds secrets in a prompt, hands each new value to a vault, and swaps it for its id.

import { randomBytes } from "node:crypto";
import { secretSpans } from "./detect.ts";
import { CAPTURE_NAMESPACE } from "./substitute.ts";
import { DEFAULT_NAMESPACE } from "./vault.ts";

const SUFFIX_MIN_LENGTH = 20;
const SUFFIX_LENGTH = 4;
// `name=value` right before a secret: the name the person gave it, at a word boundary.
const GIVEN_NAME = /(?<![\w.-])([a-z][a-z0-9-]{1,40})=$/;

interface Captured {
  readonly id: string;
  /** The last characters of the value; null when the value is too short to show any. */
  readonly suffix: string | null;
  /** What the value is (`private-key`, `github-pat`, `credential-value`), for the toast. */
  readonly kind: string;
}

export interface Capture {
  readonly text: string;
  readonly captured: Captured[];
  /** Names the person gave that were already stored; their values went in under a generated id. */
  readonly taken: string[];
}

/** What a capture needs from the vault. */
export interface Vault {
  store: (namespace: string, key: string, value: string) => void;
  exists: (namespace: string, key: string) => boolean;
}

/**
 * The text with each secret replaced by `{{secret:<id>}}` and, for a long one, its last four
 * characters. A secret pasted as `name=value` is stored under that name in the default namespace and
 * shown as `{{secret:qsm/<name>}}`; one whose name is taken, or that has none, gets `cap_<hex>`.
 * `store` is called once per distinct value, and never when the text holds none.
 */
export function captureSecrets(text: string, vault: Vault): Capture {
  const captured: Captured[] = [];
  const byValue = new Map<string, Captured>();
  const taken: string[] = [];
  const named = new Set<string>();
  let out = "";
  let at = 0;
  for (const { start, end, kind } of secretSpans(text)) {
    const value = text.slice(start, end);
    const suffix = value.length >= SUFFIX_MIN_LENGTH ? value.slice(-SUFFIX_LENGTH) : null;
    const name = GIVEN_NAME.exec(text.slice(at, start))?.[1];
    let from = start;
    let found: Captured | undefined;
    if (name !== undefined) {
      if (named.has(name) || vault.exists(DEFAULT_NAMESPACE, name)) {
        taken.push(name);
      } else {
        vault.store(DEFAULT_NAMESPACE, name, value);
        named.add(name);
        found = { id: `${DEFAULT_NAMESPACE}/${name}`, suffix, kind };
        captured.push(found);
        byValue.set(value, found);
        from = start - name.length - 1;
      }
    }
    found ??= byValue.get(value);
    if (found === undefined) {
      found = { id: `cap_${randomBytes(6).toString("hex")}`, suffix, kind };
      vault.store(CAPTURE_NAMESPACE, found.id, value);
      captured.push(found);
      byValue.set(value, found);
    }
    out += `${text.slice(at, from)}{{secret:${found.id}}}${found.suffix === null ? "" : `…${found.suffix}`}`;
    at = end;
  }
  return { text: out + text.slice(at), captured, taken };
}
