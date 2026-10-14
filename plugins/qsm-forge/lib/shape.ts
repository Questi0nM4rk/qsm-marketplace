// Forge answers arrive as JSON of unknown shape. A guard checks the fields the code reads and
// narrows the value to the interface that names them, so no caller casts.

import { isRecord } from "../../../lib/outcome.ts";

export type Guard<T> = (value: unknown) => value is T;

export const isString: Guard<string> = (value): value is string => typeof value === "string";
export const isNumber: Guard<number> = (value): value is number => typeof value === "number";
export const isBoolean: Guard<boolean> = (value): value is boolean => typeof value === "boolean";

/** The value is null, or the inner guard accepts it. */
export function orNull<T>(inner: Guard<T>): Guard<T | null> {
  return (value): value is T | null => value === null || inner(value);
}

/** The value is absent, or the inner guard accepts it. */
export function orAbsent<T>(inner: Guard<T>): Guard<T | undefined> {
  return (value): value is T | undefined => value === undefined || inner(value);
}

export function arrayOf<T>(inner: Guard<T>): Guard<readonly T[]> {
  return (value): value is readonly T[] =>
    Array.isArray(value) && value.every((item) => inner(item));
}

/** An object whose every named field passes its guard; other fields are left alone. A field that
 * may be missing takes `orAbsent`. */
export function objectOf<T extends object>(fields: {
  readonly [K in keyof T]-?: Guard<T[K]>;
}): Guard<T> {
  const entries = Object.entries<Guard<unknown>>(fields);
  return (value): value is T =>
    isRecord(value) && entries.every(([name, guard]) => guard(value[name]));
}
