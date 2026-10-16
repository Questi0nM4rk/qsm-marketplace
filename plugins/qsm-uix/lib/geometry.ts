// The two coordinate shapes every verb takes from the command line.

import { QsmError } from "../../../lib/qsm-error.ts";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

const RECT_FIELDS = 4;
const POINT_FIELDS = 2;

function numbers(raw: string): number[] {
  return raw.split(",").map((part) => Number(part.trim()));
}

/** `X,Y,W,H`, non-negative integers, width and height above zero. A region of
 * zero area has no colour to report, so it is a bad call, not an empty one. */
export function parseRect(raw: string, flag = "--rect"): Rect {
  const parts = numbers(raw);
  const [x, y, w, h] = parts;
  const shaped = parts.length === RECT_FIELDS && parts.every((v) => Number.isInteger(v) && v >= 0);
  if (!shaped || x === undefined || y === undefined || w === undefined || h === undefined) {
    throw new QsmError("usage", `${flag} must be X,Y,W,H with non-negative integers, got: ${raw}`);
  }
  if (w === 0 || h === 0) {
    throw new QsmError("usage", `${flag} must have a width and a height above zero, got: ${raw}`);
  }
  return { x, y, w, h };
}

/** `X,Y`, non-negative integers. A pixel index is never fractional. */
export function parsePoint(raw: string, flag: string): Point {
  const parts = numbers(raw);
  const [x, y] = parts;
  const shaped = parts.length === POINT_FIELDS && parts.every((v) => Number.isInteger(v) && v >= 0);
  if (!shaped || x === undefined || y === undefined) {
    throw new QsmError("usage", `${flag} must be X,Y with non-negative integers, got: ${raw}`);
  }
  return { x, y };
}

/** A count flag: an integer at or above `min`. */
export function requireCount(value: number | undefined, flag: string, min: number): number {
  if (value === undefined || !Number.isInteger(value) || value < min) {
    throw new QsmError(
      "usage",
      `${flag} must be an integer of at least ${min}, got: ${value ?? "nothing"}`,
    );
  }
  return value;
}

/** A measurement flag that may be fractional: a zoom factor, a delay. */
export function requireAmount(value: number | undefined, flag: string, min: number): number {
  if (value === undefined || !Number.isFinite(value) || value < min) {
    throw new QsmError(
      "usage",
      `${flag} must be a number of at least ${min}, got: ${value ?? "nothing"}`,
    );
  }
  return value;
}
