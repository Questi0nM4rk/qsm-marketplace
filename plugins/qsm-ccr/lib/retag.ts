// A refusal handed up through a step whose success carries other data: the same code and message,
// `suffix` added when the step has more to say, and no data. Never called on an ok outcome.
import type { Outcome } from "../../../lib/outcome.ts";

export function retag<T>(refusal: Outcome, suffix = ""): Outcome<T> {
  return { code: refusal.code, message: `${refusal.message ?? ""}${suffix}` };
}
