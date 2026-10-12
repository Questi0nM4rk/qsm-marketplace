import { describe, expect, test } from "bun:test";
import { formatSizeReport, sizeReport } from "./size.ts";
import { encode } from "./toon-encode.ts";

const TABULAR = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  name: `person-${i}`,
  city: "Brno",
}));

const NESTED = { a: { b: { c: { d: { e: "one deep value" } } } } };

describe("size is the decision gate", () => {
  test("tabular input reports a ratio below one and says TOON is smaller", () => {
    const json = JSON.stringify(TABULAR, null, 2);
    const report = sizeReport("people.json", json, encode(TABULAR));
    expect(report.ratio).toBeLessThan(1);
    expect(report.verdict).toContain("smaller");
  });

  test("TOON is larger", () => {
    const json = JSON.stringify(NESTED);
    const report = sizeReport("nested.json", json, encode(NESTED));
    expect(report.ratio).toBeGreaterThan(1);
    expect(report.verdict).toContain("larger");
  });

  test("the output says the token counts are estimated", () => {
    const report = sizeReport("x", "abcd", "ab");
    expect(report.estimated).toBe(true);
    expect(formatSizeReport(report)).toContain("estimate");
  });

  test("characters and estimated tokens are both reported", () => {
    const report = sizeReport("x", "abcdefgh", "abcd");
    expect(report.originalChars).toBe(8);
    expect(report.toonChars).toBe(4);
    expect(report.originalTokens).toBe(2);
    expect(report.toonTokens).toBe(1);
    expect(report.ratio).toBe(0.5);
  });
});
