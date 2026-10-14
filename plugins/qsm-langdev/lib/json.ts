// Narrowing for values of unknown shape (JSON.parse, a spawn's stdout): a guard checks what the
// caller reads, so no cast stands in for the check.

export type Rec = Record<string, unknown>;

/** An object that is neither null nor an array. */
export function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
