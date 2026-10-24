// The scorer is the eval's only judge, so each critical error type is proved on a planted case.

import { expect, test } from "bun:test";
import { join } from "node:path";
import { scoreDir, scoreThread } from "./score.ts";

const rows = new Map(scoreDir(join(import.meta.dir, "selftest")).map((r) => [r.run, r.totals]));

test("a perfect run scores no error, with the speaker's name in either order", () => {
  const s = rows.get("perfect-1.json");
  expect(Object.values(s?.critical ?? {})).toEqual([0, 0, 0, 0, 0, 0]);
  expect(s?.edits).toBe(0);
});

test("a broken run scores each planted error once", () => {
  expect(rows.get("broken-1.json")?.critical).toEqual({
    omitted_message: 0,
    hallucinated: 1,
    wrong_speaker: 1,
    quote: 1,
    id_or_number: 1,
    negation: 1,
  });
});

test("a run that is not JSON is reported, not skipped", () => {
  expect(rows.has("bad-1.json")).toBe(true);
  expect(rows.get("bad-1.json")).toBeNull();
});

test.each([
  ["ne", "", 1],
  ["NE!", "", 1],
  ["nE", "Ne", 0],
  ["ne-ne", "", 1],
  ["éne", "", 1],
  ["Kne", "", 1],
  ["neé", "", 1],
  ["_ne", "", 0],
  ["ne_", "", 0],
  ["2ne", "", 0],
  ["ne2", "", 0],
  ["new", "", 0],
] as const)("standalone negation keeps its boundaries: %s -> %s", (gold, candidate, expected) => {
  const result = scoreThread(
    { messages: [{ text: `alpha beta gamma ${gold}` }] },
    { messages: [{ text: `alpha beta gamma ${candidate}` }] },
  );
  expect(result.matched).toBe(1);
  expect(result.critical.negation).toBe(expected);
});
