// What `qsm-setup relink --auto --json` printed, read the one way the module reads it.

export type RelinkOutput =
  | { readonly kind: "relinked" }
  | { readonly kind: "skipped"; readonly reason: string }
  | { readonly kind: "unreadable"; readonly reason: string };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The envelope's own `data.reason` when it is a string, else the fallback
 * a skip with no reason of its own gets. */
function skipReason(data: Record<string, unknown>): string {
  return typeof data.reason === "string" ? data.reason : "not relinked";
}

function parseEnvelope(stdout: string): { data: Record<string, unknown> } | { reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    return { reason: "stdout is not JSON" };
  }
  if (!(record(parsed) && "data" in parsed && record(parsed.data))) {
    return { reason: "not an outcome envelope: no data field" };
  }
  return { data: parsed.data };
}

/** `{ kind: "relinked" }` when the envelope's `data.relinked` is `true`,
 * `{ kind: "skipped", reason }` when it is `false` (the envelope's own
 * `data.reason` when there is one, else "not relinked"), `unreadable` with
 * the reason for anything else: stdout that does not parse, an envelope
 * with no `data`, or `data.relinked` missing or not a boolean. */
export function readRelinkOutput(stdout: string): RelinkOutput {
  const envelope = parseEnvelope(stdout);
  if ("reason" in envelope) {
    return { kind: "unreadable", reason: envelope.reason };
  }
  const { relinked } = envelope.data;
  if (relinked === true) {
    return { kind: "relinked" };
  }
  if (relinked === false) {
    return { kind: "skipped", reason: skipReason(envelope.data) };
  }
  return { kind: "unreadable", reason: `data.relinked is ${typeof relinked}, not a boolean` };
}
