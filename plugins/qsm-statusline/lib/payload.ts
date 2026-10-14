// The status-line payload is another program's JSON, arriving on stdin once per frame.

export interface RateLimit {
  readonly percent: number;
  /** Epoch seconds, or null when the payload carried no usable stamp. */
  readonly resetsAt: number | null;
}

export interface Snapshot {
  readonly model: string;
  readonly contextSize: number;
  readonly usedPercent: number;
  readonly cwd: string | null;
  readonly session: RateLimit | null;
  readonly week: RateLimit | null;
}

/** What the window holds when the payload does not say. Every current build
 * sends the real number; this keeps the token counts finite when one does not. */
export const DEFAULT_CONTEXT_SIZE = 200_000;

const MILLIS_PER_SECOND = 1000;
const NUMERIC = /^-?\d+(\.\d+)?$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function at(value: unknown, ...path: string[]): unknown {
  let here: unknown = value;
  for (const key of path) {
    if (!isRecord(here)) {
      return undefined;
    }
    here = here[key];
  }
  return here;
}

/** A number floors, a numeric string parses, anything else is absent. */
export function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string" && NUMERIC.test(value)) {
    return Math.floor(Number(value));
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** `resets_at` is an integer epoch in the payload and an ISO string from the subscription API. */
export function epochSeconds(value: unknown): number | null {
  const asNumber = num(value);
  if (asNumber !== null) {
    return asNumber;
  }
  const iso = text(value);
  if (iso === null) {
    return null;
  }
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / MILLIS_PER_SECOND);
}

/** A window with no readable percentage is absent, not zero: no bar beats a
 * bar drawn at a number nobody sent. */
function rateLimit(value: unknown): RateLimit | null {
  const percent = num(at(value, "used_percentage") ?? at(value, "utilization"));
  if (percent === null) {
    return null;
  }
  return { percent, resetsAt: epochSeconds(at(value, "resets_at")) };
}

export function readSnapshot(raw: unknown): Snapshot {
  return {
    model: text(at(raw, "model", "display_name")) ?? "unknown",
    contextSize: num(at(raw, "context_window", "context_window_size")) ?? DEFAULT_CONTEXT_SIZE,
    usedPercent: num(at(raw, "context_window", "used_percentage")) ?? 0,
    cwd: text(at(raw, "workspace", "current_dir")) ?? text(at(raw, "cwd")),
    session: rateLimit(at(raw, "rate_limits", "five_hour")),
    week: rateLimit(at(raw, "rate_limits", "seven_day")),
  };
}

/** Text that is not JSON at all yields the same snapshot an empty payload does. */
export function parsePayload(input: string): Snapshot {
  if (input.trim().length === 0) {
    return readSnapshot(null);
  }
  try {
    return readSnapshot(JSON.parse(input));
  } catch {
    return readSnapshot(null);
  }
}
