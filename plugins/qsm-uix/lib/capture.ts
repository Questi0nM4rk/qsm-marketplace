// The seven verbs.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  AA_LARGE_OR_UI_RATIO,
  AA_TEXT_RATIO,
  contrastRatio,
  type Pixel,
  parsePixelDump,
  summarizeRegion,
} from "./color.ts";
import { CaptureError, usageError } from "./errors.ts";
import { parsePoint, parseRect, type Rect, requireAmount, requireCount } from "./geometry.ts";
import { run, runOrThrow } from "./run.ts";

/** The screenshot tool: one full monitor to a PNG file. */
export const SCREENSHOT_TOOL = "grim";
/** The image tool: cropping, resizing, comparing, and dumping pixels. */
export const IMAGE_TOOL = "magick";
/** Only consulted when no monitor was named; never a hard prerequisite. */
const MONITOR_TOOL = "hyprctl";

/**
 * The single-pixel dumps a region scan asks for grow with its area, and a region big enough to
 * need a million of them is a screenshot, not a measurement.
 */
const MAX_REGION_PIXELS = 65_536;
const DEFAULT_PALETTE_TOP = 6;
const MIN_BURST_FRAMES = 2;
const FRAME_DIGITS = 3;
const PERCENT = 100;
/** The image tool's `compare` says 0 for identical, 1 for different, and
 * more than that for a real error. Both of the first two are answers. */
const COMPARE_DIFFERENT = 1;
const SSIM_NORMALIZED = /\(([\d.eE+-]+)\)/;

/** Where a verb puts a file the caller did not name. `QSM_UIX_DIR` moves it;
 * nothing else about the environment is read. */
function outputDir(): string {
  return process.env.QSM_UIX_DIR ?? join(process.env.TMPDIR ?? "/tmp", "qsm-uix");
}

function defaultPath(prefix: string): string {
  return join(outputDir(), `${prefix}-${Date.now()}.png`);
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

interface Monitor {
  readonly name: string;
  readonly focused: boolean;
}

/** The monitor the user is looking at, when they did not name one. */
function focusedMonitor(): string {
  const { stdout } = runOrThrow([MONITOR_TOOL, "monitors", "-j"]);
  const monitors: Monitor[] = JSON.parse(stdout);
  const focused = monitors.find((monitor) => monitor.focused);
  if (focused === undefined) {
    throw new CaptureError(`no focused monitor reported by ${MONITOR_TOOL}`);
  }
  return focused.name;
}

function shoot(output: string, file: string): void {
  ensureDir(dirname(file));
  runOrThrow([SCREENSHOT_TOOL, "-o", output, file]);
}

const SIZE_LINE = /^(\d+) (\d+)$/;

function imageSize(image: string): { readonly w: number; readonly h: number } {
  const { stdout } = runOrThrow([IMAGE_TOOL, "identify", "-format", "%w %h", image]);
  const match = SIZE_LINE.exec(stdout.trim());
  const [, w, h] = match ?? [];
  if (w === undefined || h === undefined) {
    throw new CaptureError(`${IMAGE_TOOL} did not report a size for ${image}: ${stdout.trim()}`);
  }
  return { w: Number(w), h: Number(h) };
}

/** A region that runs off the edge of the image is refused, not clipped. */
function requireInside(image: string, rect: Rect): void {
  const size = imageSize(image);
  if (rect.x + rect.w > size.w || rect.y + rect.h > size.h) {
    throw usageError(
      `region ${rect.x},${rect.y},${rect.w},${rect.h} runs outside ${image}, which is ${size.w}x${size.h}`,
    );
  }
}

/** Two images of different sizes are refused, not measured. */
function requireSameSize(a: string, b: string): void {
  const sa = imageSize(a);
  const sb = imageSize(b);
  if (sa.w !== sb.w || sa.h !== sb.h) {
    throw usageError(
      `diff needs two images of the same size: ${a} is ${sa.w}x${sa.h}, ${b} is ${sb.w}x${sb.h}`,
    );
  }
}

/** The image tool's text dump of a region, as pixels in image coordinates. */
function dumpPixels(image: string, rect: Rect): Pixel[] {
  requireInside(image, rect);
  const { stdout } = runOrThrow([
    IMAGE_TOOL,
    image,
    "-crop",
    `${rect.w}x${rect.h}+${rect.x}+${rect.y}`,
    "+repage",
    "-alpha",
    "off",
    "-depth",
    "8",
    "txt:-",
  ]);
  const pixels = parsePixelDump(stdout, rect);
  if (pixels.length === 0) {
    throw new CaptureError(
      `no pixels at ${rect.x},${rect.y},${rect.w},${rect.h} of ${image}: is the region inside the image?`,
    );
  }
  return pixels;
}

function samplePixel(image: string, x: number, y: number): Pixel {
  const [pixel] = dumpPixels(image, { x, y, w: 1, h: 1 });
  if (pixel === undefined) {
    throw new CaptureError(`could not sample pixel ${x},${y} of ${image}`);
  }
  return pixel;
}

export interface ScreenshotCall {
  /** monitor name; the focused one when absent */
  readonly output?: string | undefined;
  readonly out?: string | undefined;
}

export function screenshot(call: ScreenshotCall): object {
  const output = call.output ?? focusedMonitor();
  const file = call.out ?? defaultPath(`screenshot-${output}`);
  shoot(output, file);
  return { action: "screenshot", output, file };
}

export interface CropCall {
  readonly input: string;
  /** region as X,Y,W,H */
  readonly rect: string;
  readonly zoom?: number | undefined;
  readonly out?: string | undefined;
}

export function crop(call: CropCall): object {
  const rect = parseRect(call.rect);
  const zoom = call.zoom === undefined ? 1 : requireAmount(call.zoom, "--zoom", 1);
  requireInside(call.input, rect);
  const file = call.out ?? defaultPath("crop");
  ensureDir(dirname(file));
  // A point filter, never a smooth one: the whole purpose of the zoom is to judge pixel snapping,
  // radii, and antialiasing, and a resampled edge is the tool inventing the answer.
  runOrThrow([
    IMAGE_TOOL,
    call.input,
    "-crop",
    `${rect.w}x${rect.h}+${rect.x}+${rect.y}`,
    "+repage",
    "-filter",
    "point",
    "-resize",
    `${zoom * PERCENT}%`,
    file,
  ]);
  return { action: "crop", input: call.input, rect, zoom, file };
}

export interface DiffCall {
  readonly a: string;
  readonly b: string;
  readonly out?: string | undefined;
}

export function diff(call: DiffCall): object {
  const { a, b } = call;
  requireSameSize(a, b);
  const file = call.out ?? defaultPath("diff");
  ensureDir(dirname(file));
  const result = run([IMAGE_TOOL, "compare", "-metric", "SSIM", a, b, file]);
  if (result.exitCode > COMPARE_DIFFERENT) {
    throw new CaptureError(`${IMAGE_TOOL} compare failed: ${result.stderr.trim()}`);
  }
  // The tool prints a distortion for SSIM, not a similarity: "raw (normalized)", where 0 means
  // identical. It is reported under the name `distortion` so no reader reads it as a score.
  const raw = result.stderr.trim();
  const normalized = SSIM_NORMALIZED.exec(raw)?.[1];
  const distortion = Number.parseFloat(normalized ?? raw);
  if (!Number.isFinite(distortion)) {
    throw new CaptureError(`unreadable SSIM output from ${IMAGE_TOOL}: ${raw}`);
  }
  return { action: "diff", a, b, distortion, identical: result.exitCode === 0, diffImage: file };
}

export interface BurstCall {
  readonly count: number;
  /** milliseconds between frames */
  readonly interval: number;
  readonly outDir: string;
  readonly output?: string | undefined;
}

export async function burst(call: BurstCall): Promise<object> {
  const count = requireCount(call.count, "--count", MIN_BURST_FRAMES);
  const intervalMs = requireAmount(call.interval, "--interval", 0);
  const { outDir } = call;
  const output = call.output ?? focusedMonitor();
  ensureDir(outDir);
  const frames: Array<{ file: string; atMs: number }> = [];
  const start = Date.now();
  for (let index = 0; index < count; index += 1) {
    const file = join(outDir, `frame-${String(index).padStart(FRAME_DIGITS, "0")}.png`);
    shoot(output, file);
    // The real elapsed time, not the requested one: a screenshot takes as long as it takes, and a
    // timeline built from the asked-for interval would be a guess wearing a measurement's clothes.
    frames.push({ file, atMs: Date.now() - start });
    if (index < count - 1) {
      await sleep(intervalMs);
    }
  }
  return { action: "burst", output, frames };
}

export interface PixelSampleCall {
  readonly image: string;
  /** the pixel as X,Y */
  readonly at: string;
}

export function pixelSample(call: PixelSampleCall): object {
  const at = parsePoint(call.at, "--at");
  const pixel = samplePixel(call.image, at.x, at.y);
  return {
    action: "pixel-sample",
    image: call.image,
    at,
    hex: pixel.hex,
    r: pixel.r,
    g: pixel.g,
    b: pixel.b,
  };
}

export interface ContrastCall {
  readonly image: string;
  /** the foreground pixel as X,Y */
  readonly fg: string;
  /** the background pixel as X,Y */
  readonly bg: string;
}

export function contrast(call: ContrastCall): object {
  const fgAt = parsePoint(call.fg, "--fg");
  const bgAt = parsePoint(call.bg, "--bg");
  const fg = samplePixel(call.image, fgAt.x, fgAt.y);
  const bg = samplePixel(call.image, bgAt.x, bgAt.y);
  const ratio = contrastRatio(fg, bg);
  return {
    action: "contrast",
    image: call.image,
    fg: { x: fgAt.x, y: fgAt.y, hex: fg.hex },
    bg: { x: bgAt.x, y: bgAt.y, hex: bg.hex },
    ratio,
    wcagAaText: ratio >= AA_TEXT_RATIO,
    wcagAaLargeOrUi: ratio >= AA_LARGE_OR_UI_RATIO,
  };
}

export interface RegionStatsCall {
  readonly image: string;
  /** region as X,Y,W,H */
  readonly rect: string;
  readonly top?: number | undefined;
}

export function regionStats(call: RegionStatsCall): object {
  const rect = parseRect(call.rect);
  if (rect.w * rect.h > MAX_REGION_PIXELS) {
    throw usageError(
      `region ${rect.w}x${rect.h} is over ${MAX_REGION_PIXELS} pixels: scan a tighter rect`,
    );
  }
  const top = call.top === undefined ? DEFAULT_PALETTE_TOP : requireCount(call.top, "--top", 1);
  return {
    action: "region-stats",
    image: call.image,
    rect,
    ...summarizeRegion(dumpPixels(call.image, rect), top),
  };
}
