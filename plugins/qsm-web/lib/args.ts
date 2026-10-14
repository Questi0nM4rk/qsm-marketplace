// Typed readers for a verb's parsed arguments. The parser in root lib/cli-base.ts already converted
// each value to the type qsm.json declares; these readers say so to the compiler and fail loud when
// a handler and its declaration drift apart.
import type { Call } from "../../../lib/cli-base.ts";
import { BoxError } from "./box-error.ts";

type Args = Call["args"];

function drift(name: string, want: string): BoxError {
  return new BoxError(
    "usage",
    `argument ${name} is not ${want}; qsm.json and the handler disagree`,
  );
}

/** A required string argument. */
export function requiredText(args: Args, name: string): string {
  const v = args[name];
  if (typeof v !== "string") {
    throw drift(name, "a string");
  }
  return v;
}

export function optionalText(args: Args, name: string): string | undefined {
  const v = args[name];
  if (v !== undefined && typeof v !== "string") {
    throw drift(name, "a string");
  }
  return v;
}

/** A required number argument. */
export function requiredNumber(args: Args, name: string): number {
  const v = args[name];
  if (typeof v !== "number") {
    throw drift(name, "a number");
  }
  return v;
}

export function optionalNumber(args: Args, name: string): number | undefined {
  const v = args[name];
  if (v !== undefined && typeof v !== "number") {
    throw drift(name, "a number");
  }
  return v;
}

/** A repeatable argument. */
export function texts(args: Args, name: string): readonly string[] {
  const v = args[name];
  if (!Array.isArray(v)) {
    throw drift(name, "a list of strings");
  }
  return v;
}

/** A JSON object of unknown contents: the guard for a parsed value before any field is read. */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
