// A failure thrown from deep code, for runCli to map.
import { fail, messageOf, type Outcome, type OutcomeCode, UsageError } from "./outcome.ts";

/** A failure thrown from deep code: runCli turns it into `fail(code, message)` and, with `next`,
 * the one thing the person should do, which text prints as `next: ...` and `--json` carries as
 * `data.next`. */
export class QsmError extends Error {
  readonly code: Exclude<OutcomeCode, "ok">;
  readonly next: string | undefined;
  constructor(
    code: Exclude<OutcomeCode, "ok">,
    message: string,
    options: { readonly next?: string; readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.next = options.next;
  }
}

/** The data of a thrown failure: the next step a QsmError named, or nothing. */
export type Thrown = { readonly next: string } | undefined;

/** A throw as an outcome: a QsmError keeps its code and its next step, a UsageError is usage, any
 * other throw is failed. */
export function fromThrown(e: unknown): Outcome<Thrown> {
  if (e instanceof QsmError) {
    return fail(e.code, e.message, e.next === undefined ? undefined : { next: e.next });
  }
  return fail(e instanceof UsageError ? "usage" : "failed", messageOf(e));
}
