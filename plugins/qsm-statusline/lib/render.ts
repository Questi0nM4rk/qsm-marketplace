// Composing the lines.

import { type GitState, isClean } from "./git.ts";
import type { RateLimit, Snapshot } from "./payload.ts";

export interface RenderInput {
  readonly snapshot: Snapshot;
  /** null when the directory is not a repository, or the state is not known
   * yet; the segment is omitted rather than shown as an error. */
  readonly git: GitState | null;
  /** Epoch seconds, so a reset time renders the same in a test as it does now. */
  readonly now: number;
  readonly color: boolean;
}

const CONTEXT_BAR = 15;
const LIMIT_BAR = 10;
const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
const MILLION = 1_000_000;
const THOUSAND = 1000;

const CODES = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  dim: "\u001B[2m",
  red: "\u001B[31m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  cyan: "\u001B[36m",
  orange: "\u001B[38;5;208m",
  gray: "\u001B[38;5;245m",
} as const;

type ColorName = keyof typeof CODES;

class Paint {
  private readonly on: boolean;

  constructor(on: boolean) {
    this.on = on;
  }

  wrap(name: ColorName, body: string): string {
    return this.on ? `${CODES[name]}${body}${CODES.reset}` : body;
  }

  code(name: ColorName): string {
    return this.on ? CODES[name] : "";
  }
}

/** One scale for every percentage on the line. A second scale would mean the
 * same colour meant two different amounts of trouble. */
function severity(percent: number): ColorName {
  if (percent >= 80) {
    return "red";
  }
  if (percent >= 50) {
    return "orange";
  }
  if (percent >= 25) {
    return "yellow";
  }
  return "green";
}

export function bar(percent: number, width: number): string {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const filled = Math.round((clamped * width) / 100);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

export function formatTokens(count: number): string {
  return count >= MILLION ? `${Math.floor(count / MILLION)}m` : `${Math.floor(count / THOUSAND)}k`;
}

/** "3d 4h", "27m", "<1m", "now". Minutes are noise beside days, so they drop
 * once the reset is more than a day out. */
export function untilReset(target: number, now: number): string {
  const left = target - now;
  if (left <= 0) {
    return "now";
  }
  const days = Math.floor(left / SECONDS_PER_DAY);
  const hours = Math.floor((left % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((left % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (days === 0 && minutes > 0) {
    parts.push(`${minutes}m`);
  }
  return parts.length === 0 ? "<1m" : parts.join(" ");
}

function limitSegment(label: string, limit: RateLimit, input: RenderInput, paint: Paint): string {
  const tone = severity(limit.percent);
  const head = `${label}: ${paint.wrap(tone, bar(limit.percent, LIMIT_BAR))} ${paint.wrap(tone, `${limit.percent}%`)}`;
  if (limit.resetsAt === null) {
    return head;
  }
  return `${head} ${paint.wrap("dim", `resets in ${untilReset(limit.resetsAt, input.now)}`)}`;
}

/** Counters, or "clean". The branch rides in the label because it is the same
 * question: what state is this checkout in. */
function gitSegment(state: GitState, paint: Paint): string {
  const label = state.branch === null ? "git" : `git ${paint.wrap("green", state.branch)}`;
  if (isClean(state)) {
    return `${label}: ${paint.wrap("green", "clean")}`;
  }
  const counts: string[] = [];
  if (state.staged > 0) {
    counts.push(paint.wrap("green", `+${state.staged}`));
  }
  if (state.modified > 0) {
    counts.push(paint.wrap("orange", `~${state.modified}`));
  }
  if (state.untracked > 0) {
    counts.push(paint.wrap("red", `?${state.untracked}`));
  }
  if (state.conflicts > 0) {
    counts.push(paint.wrap("red", `!${state.conflicts}`));
  }
  return `${label}: ${counts.join(" ")}`;
}

function join(paint: Paint, parts: readonly string[]): string {
  return parts.join(` ${paint.wrap("gray", "|")} `);
}

function modelLine(input: RenderInput, paint: Paint): string {
  const { model, contextSize, usedPercent } = input.snapshot;
  const used = Math.floor((contextSize * usedPercent) / 100);
  const tokens = `${formatTokens(used)}/${paint.wrap("cyan", formatTokens(contextSize))}`;
  return join(paint, [`${paint.code("bold")}${paint.wrap("green", model)}`, tokens]);
}

function contextLine(input: RenderInput, paint: Paint): string {
  const percent = input.snapshot.usedPercent;
  const tone = severity(percent);
  const context = `context: ${paint.wrap(tone, bar(percent, CONTEXT_BAR))} ${paint.wrap(tone, `${percent}%`)}`;
  return input.git === null ? context : join(paint, [context, gitSegment(input.git, paint)]);
}

function limitsLine(input: RenderInput, paint: Paint): string | null {
  const segments: string[] = [];
  if (input.snapshot.session !== null) {
    segments.push(limitSegment("session", input.snapshot.session, input, paint));
  }
  if (input.snapshot.week !== null) {
    segments.push(limitSegment("week", input.snapshot.week, input, paint));
  }
  return segments.length === 0 ? null : join(paint, segments);
}

/**
 * Every line is built from sources that may be absent, and an absent source removes its segment.
 */
export function render(input: RenderInput): string[] {
  const paint = new Paint(input.color);
  const lines = [modelLine(input, paint), contextLine(input, paint)];
  const limits = limitsLine(input, paint);
  if (limits !== null) {
    lines.push(limits);
  }
  return lines;
}
