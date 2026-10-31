// What one row of the capture index is, and the id it is filed under. Pure and import-free, because
// hooks/register.tsx reads the rows of `qsm-secrets captures` inside the engine sandbox.

/** One captured entry: what it was, when, and where. Never a value or any part of one. */
export interface CaptureRow {
  readonly kind: string;
  /** ISO 8601, UTC. */
  readonly capturedAt: string;
  readonly session: string | null;
  readonly cwd: string | null;
}

/** A row of `qsm-secrets captures`: an index row whose entry is still stored. */
export interface CaptureListing extends CaptureRow {
  readonly namespace: string;
  readonly key: string;
}

/** The id an entry's row is filed under in the index, and how the review list names it. */
export const rowId = (namespace: string, key: string): string => `${namespace}/${key}`;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

export function isRow(value: unknown): value is CaptureRow {
  return (
    isObject(value) &&
    typeof value.kind === "string" &&
    typeof value.capturedAt === "string" &&
    isNullableString(value.session) &&
    isNullableString(value.cwd)
  );
}

export function isListing(value: unknown): value is CaptureListing {
  return (
    isObject(value) &&
    typeof value.namespace === "string" &&
    typeof value.key === "string" &&
    isRow(value)
  );
}
