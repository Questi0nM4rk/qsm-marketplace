// The scorer is the eval's only judge, so each critical error type is proved on a planted case.

import { expect, test } from "bun:test";
import { join } from "node:path";
import { scoreDir } from "./score.ts";

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
