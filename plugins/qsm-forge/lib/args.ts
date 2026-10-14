// A call's arguments are a union of every argument type; qsm.json declares which verb takes which,
// and the parser refuses a missing or non-numeric one, so a handler reads through these.

import type { Call } from "../../../lib/cli-base.ts";

/** A required number argument, which the parser has already checked. */
export function numberArg(call: Call, name: string): number {
  const value = call.args[name];
  if (typeof value !== "number") {
    throw new TypeError(`${call.verb}: argument ${name} is not a number`);
  }
  return value;
}

/** A text argument, or null when it was not given. */
export function textArg(call: Call, name: string): string | null {
  const value = call.args[name];
  return typeof value === "string" ? value : null;
}
