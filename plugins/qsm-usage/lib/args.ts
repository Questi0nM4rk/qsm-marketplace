// The typed reads of a parsed call's arguments. The parser has already enforced the manifest
// (required, number, choices), so a value of another type here is a bug in the manifest or the
// handler, and it throws instead of carrying on.

import type { Call } from "../../../lib/cli-base.ts";

export function optionalString(call: Call, name: string): string | undefined {
  const value = call.args[name];
  if (value === undefined || typeof value === "string") {
    return value;
  }
  throw new TypeError(`argument ${name} is not a string`);
}

export function requiredString(call: Call, name: string): string {
  const value = optionalString(call, name);
  if (value === undefined) {
    throw new TypeError(`argument ${name} is required`);
  }
  return value;
}

/** A repeatable argument; none given is an empty list. */
export function stringList(call: Call, name: string): string[] {
  const value = call.args[name];
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  throw new TypeError(`argument ${name} is not a list`);
}
