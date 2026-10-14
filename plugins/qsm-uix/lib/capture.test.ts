// The verbs that touch an image, exercised against images made here. The
// fixtures are a few pixels wide on purpose: a known colour at a known
// coordinate is the only way to tell a correct measurement from a plausible
// one.
//
// These tests need the image tool on PATH, the same tool the verbs need. A
// machine without it cannot run the kit either, so a failure here is honest
// rather than a skipped test hiding a broken pipeline.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CaptureError } from "./errors.ts";
import { burst, contrast, crop, diff, IMAGE_TOOL, pixelSample, regionStats } from "./capture.ts";

import { type Command, run } from "./run.ts";

// Every sandbox this file makes is removed after the whole file, passing or
// failing: a `finally` inside one test would leave the rest behind.
const sandboxes: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "qsm-uix-"));
  sandboxes.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of sandboxes) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** One row of solid colours, one pixel each: `paint(into, name, ["#000000",
 * "#FFFFFF"])` is a two-pixel image, black on the left, white on the right. */
function paint(into: string, name: string, colors: readonly string[]): string {
  const file = join(into, name);
  const cmd: Command = [IMAGE_TOOL, ...colors.map((hex) => `xc:${hex}`), "+append", file];
  const made = run(cmd);
  if (made.exitCode !== 0) {
    throw new Error(`could not paint the fixture ${name}: ${made.stderr.trim()}`);
  }
  return file;
}

/** Calling through here makes a verb's failure a rejection whether the verb
 * itself is synchronous or not, so every test states its expectation once. */
async function verb<T>(fn: (input: T) => object | Promise<object>, input: T): Promise<object> {
  return fn(input);
}

/** What the verb throws; a verb that returns is a failed test. */
async function failure<T>(
  fn: (input: T) => object | Promise<object>,
  input: T,
): Promise<CaptureError> {
  try {
    await fn(input);
  } catch (error) {
    if (error instanceof CaptureError) {
      return error;
    }
    throw error;
  }
  throw new Error("the verb returned instead of throwing");
}

let dir = "";
let pair = "";
let quarters = "";

beforeAll(() => {
  dir = sandbox();
  pair = paint(dir, "pair.png", ["#000000", "#FFFFFF"]);
  quarters = paint(dir, "quarters.png", ["#000000", "#000000", "#000000", "#FFFFFF"]);
});

describe("pixel-sample", () => {
  test("reads the colour at the coordinate, not the one next to it", async () => {
    expect(await verb(pixelSample, { image: pair, at: "1,0" })).toMatchObject({
      action: "pixel-sample",
      hex: "#FFFFFF",
      r: 255,
      g: 255,
      b: 255,
    });
  });

  test("refuses a coordinate outside the image instead of reporting filler", async () => {
    expect((await failure(pixelSample, { image: pair, at: "9,0" })).message).toMatch(
      /runs outside/,
    );
  });

  test("refuses a coordinate that is not X,Y", async () => {
    expect((await failure(pixelSample, { image: pair, at: "1" })).code).toBe("usage");
  });
});

describe("contrast", () => {
  test("black against white is the WCAG maximum, and passes both AA levels", async () => {
    expect(await verb(contrast, { image: pair, fg: "0,0", bg: "1,0" })).toMatchObject({
      action: "contrast",
      ratio: 21,
      wcagAaText: true,
      wcagAaLargeOrUi: true,
    });
  });

  test("reports the two pixels it measured, so the finding can be re-checked", async () => {
    expect(await verb(contrast, { image: pair, fg: "0,0", bg: "1,0" })).toMatchObject({
      fg: { x: 0, y: 0, hex: "#000000" },
      bg: { x: 1, y: 0, hex: "#FFFFFF" },
    });
  });

  test("a colour against itself fails both AA levels at a ratio of 1", async () => {
    expect(await verb(contrast, { image: pair, fg: "0,0", bg: "0,0" })).toMatchObject({
      ratio: 1,
      wcagAaText: false,
      wcagAaLargeOrUi: false,
    });
  });
});

describe("region-stats", () => {
  test("reports the palette with each colour's share of the region", async () => {
    expect(await verb(regionStats, { image: quarters, rect: "0,0,4,1" })).toMatchObject({
      action: "region-stats",
      pixels: 4,
      uniqueColors: 2,
      palette: [
        { hex: "#000000", share: 75 },
        { hex: "#FFFFFF", share: 25 },
      ],
    });
  });

  test("names the brightest and the darkest pixel in image coordinates", async () => {
    expect(await verb(regionStats, { image: quarters, rect: "0,0,4,1" })).toMatchObject({
      brightest: { x: 3, y: 0, hex: "#FFFFFF" },
      darkest: { x: 0, y: 0, hex: "#000000" },
    });
  });

  test("measures only the region asked for", async () => {
    expect(await verb(regionStats, { image: quarters, rect: "0,0,3,1" })).toMatchObject({
      pixels: 3,
      uniqueColors: 1,
      palette: [{ hex: "#000000", share: 100 }],
    });
  });

  test("refuses a region that runs off the edge of the image", async () => {
    expect((await failure(regionStats, { image: quarters, rect: "0,0,40,1" })).message).toMatch(
      /runs outside/,
    );
  });

  test("refuses a region too large to be a measurement", async () => {
    expect(
      (await failure(regionStats, { image: quarters, rect: "0,0,4000,4000" })).message,
    ).toMatch(/tighter rect/);
  });
});

describe("crop", () => {
  test("writes the region it was asked for, and nothing beside it", async () => {
    const out = join(dir, "crop.png");
    expect(await verb(crop, { input: quarters, rect: "3,0,1,1", out })).toMatchObject({
      action: "crop",
      zoom: 1,
      file: out,
    });
    expect(existsSync(out)).toBe(true);
    expect(await verb(pixelSample, { image: out, at: "0,0" })).toMatchObject({ hex: "#FFFFFF" });
  });

  test("magnifies with real pixels, so a zoomed edge is still an edge", async () => {
    const out = join(dir, "zoom.png");
    await verb(crop, { input: quarters, rect: "3,0,1,1", zoom: 4, out });
    expect(await verb(regionStats, { image: out, rect: "0,0,4,4" })).toMatchObject({
      pixels: 16,
      uniqueColors: 1,
    });
  });
});

describe("diff", () => {
  test("an image against itself is identical, with zero distortion", async () => {
    expect(await verb(diff, { a: pair, b: pair, out: join(dir, "same.png") })).toMatchObject({
      action: "diff",
      distortion: 0,
      identical: true,
    });
  });

  test("two different images are not identical", async () => {
    const other = paint(dir, "inverted.png", ["#FFFFFF", "#000000"]);
    const result = await verb(diff, { a: pair, b: other, out: join(dir, "differs.png") });
    expect(result).toMatchObject({ identical: false });
    expect(result).toHaveProperty("distortion");
  });

  test("refuses two images of different sizes instead of measuring them", async () => {
    const one = paint(dir, "single.png", ["#000000"]);
    expect(
      (await failure(diff, { a: one, b: pair, out: join(dir, "mismatch.png") })).message,
    ).toMatch(/same size/);
  });
});

// Every case here is refused before the verb reaches a screenshot, so the
// argument contract is proved on a machine with no display attached.
describe("burst", () => {
  test("refuses a burst of one frame, which is a screenshot", async () => {
    expect((await failure(burst, { count: 1, interval: 100, outDir: dir })).code).toBe("usage");
  });

  test("refuses a negative interval", async () => {
    expect((await failure(burst, { count: 3, interval: -5, outDir: dir })).code).toBe("usage");
  });
});

describe("the result of every verb", () => {
  test("is one object carrying the verb's own name", async () => {
    const line = JSON.stringify(await verb(contrast, { image: pair, fg: "0,0", bg: "1,0" }));
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toMatchObject({ action: "contrast" });
  });
});
