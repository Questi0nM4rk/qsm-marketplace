// A user-facing failure is a message, a next step, and the outcome code the CLI base turns into an
// exit code. A function, not a constructor call at the use site, so a caller can write `fail(...)`
// in a `never`-typed branch.
import { type OutcomeCode } from "../../../lib/outcome.ts";
import { QsmError } from "../../../lib/qsm-error.ts";

export function fail(
  message: string,
  next: string,
  code: Exclude<OutcomeCode, "ok"> = "failed",
): never {
  throw new QsmError(code, message, { next });
}
