// Narrowing for values whose shape is not known until they are read.

/** A JSON object: not null, not an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The items of a list, or none when the value is not a list. */
export function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
