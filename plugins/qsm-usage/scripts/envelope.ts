// What the CLI tests read from a `--json` run: the outcome envelope, checked, never assumed.

import { OUTCOME_CODES, type OutcomeCode } from "../../../lib/outcome.ts";
import { isPlainObject } from "../lib/toon-scalar.ts";

export interface Envelope {
  readonly code: OutcomeCode;
  readonly exit: number;
  readonly message: string;
  readonly data: unknown;
}

function isOutcomeCode(value: unknown): value is OutcomeCode {
  return OUTCOME_CODES.some((code) => code === value);
}

/** The envelope on stdout; anything that is not one throws with the text it saw. */
export function envelopeOf(stdout: string): Envelope {
  const parsed: unknown = JSON.parse(stdout);
  if (
    !isPlainObject(parsed) ||
    !isOutcomeCode(parsed.code) ||
    typeof parsed.exit !== "number" ||
    typeof parsed.message !== "string"
  ) {
    throw new TypeError(`not an outcome envelope: ${stdout}`);
  }
  return { code: parsed.code, exit: parsed.exit, message: parsed.message, data: parsed.data };
}

/** The envelope's data as an object; any other shape throws. */
export function dataOf(envelope: Envelope): Record<string, unknown> {
  if (!isPlainObject(envelope.data)) {
    throw new TypeError(`envelope data is not an object: ${JSON.stringify(envelope.data)}`);
  }
  return envelope.data;
}
