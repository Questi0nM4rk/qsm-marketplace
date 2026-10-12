// One outcome code per cause of failure, so a caller separates "this machine has no screenshot
// tool" from "the call does not hold" from "the capture itself went wrong" without reading prose.

import type { OutcomeCode } from "../../../lib/outcome.ts";

export type FailureCode = Exclude<OutcomeCode, "ok">;

export class CaptureError extends Error {
  readonly code: FailureCode;

  constructor(message: string, code: FailureCode = "failed") {
    super(message);
    this.name = "CaptureError";
    this.code = code;
  }
}

/** A verb was called with arguments it cannot work from. */
export function usageError(message: string): CaptureError {
  return new CaptureError(message, "usage");
}

/** Names the tool, because "install something" is not an actionable error. */
export function missingToolError(tool: string): CaptureError {
  return new CaptureError(`required tool not found on PATH: ${tool}`, "missing");
}
