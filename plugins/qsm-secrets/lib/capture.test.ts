// The capture algorithm against the labelled corpus: a negative must pass untouched, a positive must
// lose exactly its secret. The floors are measured, not hoped for; before the structure checks the
// same corpus gave precision 0.584 and recall 0.743 (58 of 95 negatives clean, 52 of 70 positives).

import { describe, expect, test } from "bun:test";
import { type Case, NEGATIVES, POSITIVES } from "./capture.corpus.ts";
import { captureSecrets } from "./capture.ts";

/** The values a capture took out of a prompt, through the real function with a vault that keeps them. */
function captured(text: string): string[] {
  const values: string[] = [];
  captureSecrets(text, {
    store: (_namespace, _key, value) => {
      values.push(value);
    },
    exists: () => false,
  });
  return values;
}

const exact = (c: Case): boolean => {
  const got = captured(c.text);
  return got.length === c.secrets.length && got.every((value, i) => value === c.secrets[i]);
};

describe("the corpus", () => {
  test("is large enough to mean something", () => {
    expect(POSITIVES.length).toBeGreaterThanOrEqual(60);
    expect(NEGATIVES.length).toBeGreaterThanOrEqual(80);
  });

  test("no negative is captured: precision 1.0", () => {
    const wrong = NEGATIVES.filter((c) => !exact(c)).map((c) => c.text);
    expect(wrong).toEqual([]);
  });

  test("at least 95% of the positives are captured exactly", () => {
    const missed = POSITIVES.filter((c) => !exact(c));
    expect((POSITIVES.length - missed.length) / POSITIVES.length).toBeGreaterThanOrEqual(0.95);
  });
});
