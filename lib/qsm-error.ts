// A failure thrown from deep code, for runCli to map.
import type { OutcomeCode } from "./outcome.ts";

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
