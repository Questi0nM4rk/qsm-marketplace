// What every qsm-langdev verb shares: its lines on stderr, a refusal thrown from deep in a verb's
// helpers and turned back into its outcome, and the readers of the arguments that can refuse.

import { type Call, type Handler, optionalString } from "../../../lib/cli-base.ts";
import { fail, type Outcome, type OutcomeCode } from "../../../lib/outcome.ts";
import { findRepoRoot } from "../lib/config.ts";

export function err(line: string): void {
  process.stderr.write(`${line}\n`);
}

/** A refusal raised from deep inside a verb's helpers. */
class Refuse extends Error {
  readonly outcome: Outcome;
  constructor(outcome: Outcome) {
    super(outcome.message ?? "");
    this.outcome = outcome;
  }
}

export function refuse(code: Exclude<OutcomeCode, "ok">, message: string): never {
  throw new Refuse(fail(code, message));
}

export function guarded(handler: Handler): Handler {
  return async (call) => {
    try {
      return await handler(call);
    } catch (error) {
      if (error instanceof Refuse) {
        return error.outcome;
      }
      throw error;
    }
  };
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
  return match ?? refuse("usage", `${name} must be one of ${values.join(", ")}`);
}

export function required<T>(value: T | undefined, name: string): T {
  return value ?? refuse("usage", `${name} is required`);
}

export function requireRepo(target: string): string {
  const root = findRepoRoot(target);
  if (root === null) {
    refuse("missing", `${target} is not inside a git repository`);
  }
  return root;
}

export const dirOf = (call: Call): string => optionalString(call, "dir") ?? ".";
