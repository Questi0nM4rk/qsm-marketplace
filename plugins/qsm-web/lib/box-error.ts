import type { OutcomeCode } from "../../../lib/outcome.ts";

/** A failure that already knows its outcome code. */
export class BoxError extends Error {
  readonly code: Exclude<OutcomeCode, "ok">;
  constructor(code: Exclude<OutcomeCode, "ok">, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BoxError";
    this.code = code;
  }

  /** A failure that keeps the error it came from. */
  static because(cause: unknown, code: Exclude<OutcomeCode, "ok">, message: string): BoxError {
    return new BoxError(code, message, { cause });
  }
}
