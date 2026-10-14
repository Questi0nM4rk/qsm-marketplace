import { describe, expect, test } from "bun:test";

import { CaptureError } from "./errors.ts";
import { parsePoint, parseRect, requireAmount, requireCount } from "./geometry.ts";

/** The outcome code of what the call throws. */
function codeOf(call: () => unknown): unknown {
  try {
    call();
  } catch (error) {
    return error instanceof CaptureError ? error.code : undefined;
  }
  return undefined;
}

describe("parseRect", () => {
  test("reads X,Y,W,H", () => {
    expect(parseRect("10,20,30,40")).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });

  test("tolerates spaces around the numbers", () => {
    expect(parseRect(" 1, 2 ,3, 4 ")).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });

  test.each([
    ["10,20,30", "three fields"],
    ["10,20,30,40,50", "five fields"],
    ["10,x,30,40", "a field that is not a number"],
    ["10,20,30.5,40", "a fractional field"],
    ["-1,20,30,40", "a negative field"],
    ["", "nothing"],
  ])("refuses %p (%s)", (raw) => {
    expect(codeOf(() => parseRect(raw))).toBe("usage");
  });

  test("refuses a region of zero area, which has no colour to report", () => {
    expect(() => parseRect("0,0,0,10")).toThrow(/width and a height above zero/);
  });

  test("names the flag it was given, so the message points at the call", () => {
    expect(() => parseRect("nonsense", "--region")).toThrow(/--region must be X,Y,W,H/);
  });
});

describe("parsePoint", () => {
  test("reads X,Y", () => {
    expect(parsePoint("3,4", "--at")).toEqual({ x: 3, y: 4 });
  });

  test("accepts the origin", () => {
    expect(parsePoint("0,0", "--at")).toEqual({ x: 0, y: 0 });
  });

  test.each([
    ["3", "one field"],
    ["3,4,5", "three fields"],
    ["3,-4", "a negative field"],
    ["3.5,4", "a fractional field"],
  ])("refuses %p (%s)", (raw) => {
    expect(codeOf(() => parsePoint(raw, "--fg"))).toBe("usage");
  });
});

describe("requireCount", () => {
  test("accepts an integer at the minimum", () => {
    expect(requireCount(2, "--count", 2)).toBe(2);
  });

  test.each([
    [1, "below the minimum"],
    [2.5, "fractional"],
    [undefined, "missing"],
  ])("refuses %p (%s)", (value) => {
    expect(codeOf(() => requireCount(value, "--count", 2))).toBe("usage");
  });
});

describe("requireAmount", () => {
  test("accepts a fractional value at or above the minimum", () => {
    expect(requireAmount(1.5, "--zoom", 1)).toBe(1.5);
  });

  test.each([
    [0.5, "below the minimum"],
    [Number.NaN, "not a number"],
    [undefined, "missing"],
  ])("refuses %p (%s)", (value) => {
    expect(codeOf(() => requireAmount(value, "--zoom", 1))).toBe("usage");
  });
});
