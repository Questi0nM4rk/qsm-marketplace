// Narrowing for values of unknown shape (JSON.parse, a spawn's stdout): a guard checks what the
// caller reads, so no cast stands in for the check.

import { isRecord } from "../../../lib/outcome.ts";

export type Rec = Record<string, unknown>;

export function recordOf(value: unknown): Rec | null {
  return isRecord(value) ? value : null;
}

/** The elements of an array; null when the value is not an array. */
export function arrayOf(value: unknown): readonly unknown[] | null {
  return Array.isArray(value) ? value : null;
}

/** An array's elements as records; an element that is not an object reads as an empty record. */
export function recordsOf(value: unknown): readonly Rec[] | null {
  return arrayOf(value)?.map((item) => recordOf(item) ?? {}) ?? null;
}

export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function num(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
