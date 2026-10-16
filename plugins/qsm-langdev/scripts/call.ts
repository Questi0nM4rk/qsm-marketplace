// What every qsm-langdev verb shares: its lines on stderr and the readers of the arguments that
// can refuse (a QsmError, which runCli turns into its outcome).

import { type Call, optionalString } from "../../../lib/cli-base.ts";
import { QsmError } from "../../../lib/qsm-error.ts";
import { findRepoRoot } from "../lib/config.ts";

export function err(line: string): void {
  process.stderr.write(`${line}\n`);
}

/** The argument when it is one of `values`, undefined when it was not given. */
export function optOneOf<T extends string>(
  call: Call,
  name: string,
  values: readonly T[],
): T | undefined {
  const value = optionalString(call, name);
  if (value === undefined) {
    return undefined;
  }
  const match = values.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new QsmError("usage", `${name} must be one of ${values.join(", ")}`);
  }
  return match;
}

export function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new QsmError("usage", `${name} is required`);
  }
  return value;
}

export function requireRepo(target: string): string {
  const root = findRepoRoot(target);
  if (root === null) {
    throw new QsmError("missing", `${target} is not inside a git repository`);
  }
  return root;
}

export const dirOf = (call: Call): string => optionalString(call, "dir") ?? ".";
