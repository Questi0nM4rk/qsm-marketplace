// Colour arithmetic, with no image tool in sight.

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Pixel extends Rgb {
  readonly x: number;
  readonly y: number;
  readonly hex: string;
}

const HEX_BASE = 16;
const CHANNEL_MAX = 255;
/** WCAG 2.1 relative luminance: the sRGB transfer curve and its coefficients. */
const SRGB_KNEE = 0.040_45;
const SRGB_SLOPE = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;
/** The 0.05 on both sides of the contrast ratio, which models ambient flare. */
const FLARE = 0.05;
/** WCAG 2.1 minimums: body text, and large text or an essential UI glyph. */
export const AA_TEXT_RATIO = 4.5;
export const AA_LARGE_OR_UI_RATIO = 3;

const HEX_PIXEL = /#([0-9A-Fa-f]{6})/;
/** An image tool's text dump: `12,3: (36,38,54)  #242636  srgb(36,38,54)`. */
const DUMP_LINE = /^(\d+),(\d+):.*?#([0-9A-Fa-f]{6})(?![0-9A-Fa-f])/;

const PERCENT = 100;
/** A share is reported as a percentage with one decimal. */
const SHARE_PLACES = 1;
const RATIO_PLACES = 2;
const LUMINANCE_PLACES = 4;

export function hexToRgb(hex: string): Rgb {
  const match = HEX_PIXEL.exec(hex);
  const digits = match === null ? undefined : match[1];
  if (digits === undefined) {
    throw new Error(`not a six-digit hex colour: ${hex}`);
  }
  return {
    r: Number.parseInt(digits.slice(0, 2), HEX_BASE),
    g: Number.parseInt(digits.slice(2, 4), HEX_BASE),
    b: Number.parseInt(digits.slice(4, 6), HEX_BASE),
  };
}

export function toHex(rgb: Rgb): string {
  const pair = (channel: number): string =>
    Math.round(channel).toString(HEX_BASE).padStart(2, "0").toUpperCase();
  return `#${pair(rgb.r)}${pair(rgb.g)}${pair(rgb.b)}`;
}

export function relativeLuminance(rgb: Rgb): number {
  const linear = (channel: number): number => {
    const scaled = channel / CHANNEL_MAX;
    return scaled <= SRGB_KNEE
      ? scaled / SRGB_SLOPE
      : ((scaled + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
  };
  return LUMA_R * linear(rgb.r) + LUMA_G * linear(rgb.g) + LUMA_B * linear(rgb.b);
}

/** WCAG 2.1 contrast, rounded to hundredths: the precision a threshold is
 * argued at. 1 for two equal colours, 21 for black against white. */
export function contrastRatio(one: Rgb, other: Rgb): number {
  const a = relativeLuminance(one);
  const b = relativeLuminance(other);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return Number(((lighter + FLARE) / (darker + FLARE)).toFixed(RATIO_PLACES));
}

/** Reads an image tool's text dump into pixels, offset to the image's own
 * coordinates: the dump numbers a crop from its own corner. */
export function parsePixelDump(dump: string, origin: { x: number; y: number }): Pixel[] {
  const pixels: Pixel[] = [];
  for (const line of dump.split("\n")) {
    const match = DUMP_LINE.exec(line);
    if (match === null) {
      continue;
    }
    const [, column, row, digits] = match;
    if (column === undefined || row === undefined || digits === undefined) {
      continue;
    }
    const hex = `#${digits.toUpperCase()}`;
    pixels.push({
      x: origin.x + Number(column),
      y: origin.y + Number(row),
      hex,
      ...hexToRgb(hex),
    });
  }
  return pixels;
}

interface PaletteEntry {
  readonly hex: string;
  /** Percent of the region, one decimal. */
  readonly share: number;
}

interface SpotColor {
  readonly x: number;
  readonly y: number;
  readonly hex: string;
}

export interface RegionSummary {
  readonly pixels: number;
  readonly uniqueColors: number;
  readonly meanLuminance: number;
  readonly brightest: SpotColor;
  readonly darkest: SpotColor;
  readonly palette: readonly PaletteEntry[];
}

const spot = (pixel: Pixel): SpotColor => ({ x: pixel.x, y: pixel.y, hex: pixel.hex });

/**
 * The colour and brightness of a region as numbers a finding can cite: what it is mostly made of,
 * and the two pixels at the ends of its brightness range, which is where a contrast pair is picked
 * from.
 */
export function summarizeRegion(pixels: readonly Pixel[], top: number): RegionSummary {
  const [first] = pixels;
  if (first === undefined) {
    throw new Error("no pixels to summarize");
  }
  const counts = new Map<string, number>();
  let brightest = first;
  let darkest = first;
  let brightestLuma = relativeLuminance(first);
  let darkestLuma = brightestLuma;
  let total = 0;
  for (const pixel of pixels) {
    const luminance = relativeLuminance(pixel);
    total += luminance;
    if (luminance > brightestLuma) {
      brightest = pixel;
      brightestLuma = luminance;
    }
    if (luminance < darkestLuma) {
      darkest = pixel;
      darkestLuma = luminance;
    }
    counts.set(pixel.hex, (counts.get(pixel.hex) ?? 0) + 1);
  }
  // Ties break on the hex itself, so the same region always reports the same palette order: a
  // finding that cites "the dominant colour" must not depend on which pixel the dump happened to
  // reach first.
  const palette = [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([hex, count]) => ({
      hex,
      share: Number(((count / pixels.length) * PERCENT).toFixed(SHARE_PLACES)),
    }));
  return {
    pixels: pixels.length,
    uniqueColors: counts.size,
    meanLuminance: Number((total / pixels.length).toFixed(LUMINANCE_PLACES)),
    brightest: spot(brightest),
    darkest: spot(darkest),
    palette,
  };
}
