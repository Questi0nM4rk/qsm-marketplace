import { describe, expect, test } from "bun:test";
import {
  contrastRatio,
  hexToRgb,
  type Pixel,
  parsePixelDump,
  relativeLuminance,
  summarizeRegion,
  toHex,
} from "./color.ts";

const BLACK = hexToRgb("#000000");
const WHITE = hexToRgb("#FFFFFF");

describe("hexToRgb", () => {
  test("splits the three channels", () => {
    expect(hexToRgb("#242636")).toEqual({ r: 36, g: 38, b: 54 });
  });

  test("round-trips through toHex", () => {
    expect(toHex(hexToRgb("#1E90FF"))).toBe("#1E90FF");
  });

  test("refuses a string that is not a six-digit colour", () => {
    expect(() => hexToRgb("#abc")).toThrow(/six-digit hex/);
  });
});

describe("relativeLuminance", () => {
  test("is 0 for black and 1 for white", () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 10);
  });

  test("weights green above red above blue, as the sRGB coefficients do", () => {
    const green = relativeLuminance(hexToRgb("#00FF00"));
    const red = relativeLuminance(hexToRgb("#FF0000"));
    const blue = relativeLuminance(hexToRgb("#0000FF"));
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });
});

describe("contrastRatio", () => {
  test("black against white is the WCAG maximum of 21", () => {
    expect(contrastRatio(BLACK, WHITE)).toBe(21);
  });

  test("a colour against itself is 1", () => {
    expect(contrastRatio(hexToRgb("#242636"), hexToRgb("#242636"))).toBe(1);
  });

  test("does not depend on which colour is called the foreground", () => {
    const fg = hexToRgb("#CDD6F4");
    const bg = hexToRgb("#1E1E2E");
    expect(contrastRatio(fg, bg)).toBe(contrastRatio(bg, fg));
  });

  test("mid grey on white lands where WCAG puts it", () => {
    // #767676 on white is the canonical 4.54:1 pair, just over the body-text
    // minimum: a ratio that drifts off this is the maths, not the input.
    expect(contrastRatio(hexToRgb("#767676"), WHITE)).toBeCloseTo(4.54, 2);
  });
});

describe("parsePixelDump", () => {
  const dump = [
    "0,0: (0,0,0)  #000000  srgb(0,0,0)",
    "1,0: (255,255,255)  #FFFFFF  srgb(255,255,255)",
    "# a comment line",
  ].join("\n");

  test("reads one pixel per dump line and skips everything else", () => {
    expect(parsePixelDump(dump, { x: 0, y: 0 })).toHaveLength(2);
  });

  test("offsets the coordinates to the image, because the dump counts from the crop", () => {
    const [first] = parsePixelDump(dump, { x: 100, y: 50 });
    expect(first).toMatchObject({ x: 100, y: 50, hex: "#000000", r: 0, g: 0, b: 0 });
  });
});

function pixels(hexes: readonly string[]): Pixel[] {
  return hexes.map((hex, index) => ({ x: index, y: 0, hex, ...hexToRgb(hex) }));
}

describe("summarizeRegion", () => {
  test("counts the pixels and the distinct colours", () => {
    const summary = summarizeRegion(pixels(["#000000", "#000000", "#000000", "#FFFFFF"]), 6);
    expect(summary.pixels).toBe(4);
    expect(summary.uniqueColors).toBe(2);
  });

  test("reports each colour's share of the region as a percentage", () => {
    const summary = summarizeRegion(pixels(["#000000", "#000000", "#000000", "#FFFFFF"]), 6);
    expect(summary.palette).toEqual([
      { hex: "#000000", share: 75 },
      { hex: "#FFFFFF", share: 25 },
    ]);
  });

  test("names the brightest and the darkest pixel with their coordinates", () => {
    const summary = summarizeRegion(pixels(["#808080", "#FFFFFF", "#000000"]), 6);
    expect(summary.brightest).toEqual({ x: 1, y: 0, hex: "#FFFFFF" });
    expect(summary.darkest).toEqual({ x: 2, y: 0, hex: "#000000" });
  });

  test("keeps only the top colours asked for", () => {
    const summary = summarizeRegion(pixels(["#000000", "#000000", "#FFFFFF", "#FF0000"]), 1);
    expect(summary.palette).toEqual([{ hex: "#000000", share: 50 }]);
  });

  test("breaks a tie on the colour itself, so the same region always reports the same order", () => {
    const one = summarizeRegion(pixels(["#FFFFFF", "#000000"]), 6).palette;
    const other = summarizeRegion(pixels(["#000000", "#FFFFFF"]), 6).palette;
    expect(one).toEqual(other);
  });

  test("averages the brightness over the region", () => {
    expect(summarizeRegion(pixels(["#000000", "#FFFFFF"]), 6).meanLuminance).toBeCloseTo(0.5, 3);
  });

  test("refuses an empty region rather than inventing a summary of nothing", () => {
    expect(() => summarizeRegion([], 6)).toThrow(/no pixels/);
  });
});
