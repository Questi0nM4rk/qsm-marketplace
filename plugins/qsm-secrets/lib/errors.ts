// Every user-facing failure is a message, a next step, and the outcome code the CLI base turns into
// an exit code.
import type { OutcomeCode } from "../../../lib/outcome.ts";

export type FailureCode = Exclude<OutcomeCode, "ok">;

export class SecretError extends Error {
  readonly next: string;
  /** `missing` for a key or prerequisite that is not there, `blocked` for
   * a refusal this wrapper exists to make, `failed` for the rest. */
  readonly code: FailureCode;

  constructor(message: string, next: string, code: FailureCode = "failed") {
    super(message);
    this.name = "SecretError";
    this.next = next;
    this.code = code;
  }
}

/** Throws a SecretError. A function, not a constructor call at the use
 * site, so a caller can write `fail(...)` in a `never`-typed branch. */
export function fail(message: string, next: string, code: FailureCode = "failed"): never {
  throw new SecretError(message, next, code);
}
