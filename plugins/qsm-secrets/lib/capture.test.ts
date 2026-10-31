// The capture algorithm against the labelled corpus: a positive must lose exactly its secrets, of
// the kinds the case names, and a negative should pass untouched. Recall comes first, because a miss
// stays in a transcript for good and a false positive is one vault entry the person removes; the
// precision floor only stops a change that floods the vault.

import { describe, expect, test } from "bun:test";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { type Case, NEGATIVES, POSITIVES, producedCases } from "./capture.corpus.ts";
import { captureSecrets } from "./capture.ts";

const PRECISION_FLOOR = 0.85;

/** The values a capture took out of a prompt and their kinds, through the real function. */
function captured(text: string): { values: string[]; kinds: string[] } {
  const values: string[] = [];
  const done = captureSecrets(text, {
    store: (_namespace, _key, value) => {
      values.push(value);
    },
    exists: () => false,
  });
  return { values, kinds: done.captured.map((c) => c.kind) };
}

const exact = (c: Case): boolean => {
  const got = captured(c.text);
  return (
    got.values.length === c.secrets.length &&
    got.values.every((value, i) => value === c.secrets[i]) &&
    (c.kinds === undefined || got.kinds.every((kind, i) => kind === c.kinds?.[i]))
  );
};

const produced = producedCases(sandboxDir("capture-corpus-"));
const positives = [...POSITIVES, ...produced.positives];
const negatives = [...NEGATIVES, ...produced.negatives];

describe("the corpus", () => {
  test("is large enough to mean something", () => {
    expect(positives.length).toBeGreaterThanOrEqual(60);
    expect(negatives.length).toBeGreaterThanOrEqual(80);
  });

  test("every positive is captured exactly, with its kind: recall 1.0", () => {
    const missed = positives.filter((c) => !exact(c)).map((c) => c.text.slice(0, 60));
    expect(missed).toEqual([]);
  });

  test(`precision stays at ${PRECISION_FLOOR} or above`, () => {
    const found = positives.filter(exact).length;
    const wrong = negatives.filter((c) => !exact(c)).length;
    expect(found / (found + wrong)).toBeGreaterThanOrEqual(PRECISION_FLOOR);
  });
});
