// What a provider and the pane agree on. The request holds no secret value: it travels in the
// argv of `qs ipc call`, which any process of this user can read.

import type { Outcome } from "../../../../lib/outcome.ts";
import type { Env } from "../../../../lib/paths.ts";

/** What the person pressed. `cancel` is Escape or the close button; `deny` is the second action. */
export type Action = "allow" | "deny" | "cancel";

/** The pane's answer, one JSON line on the reply socket. The nonce proves the line was meant for it. */
export interface Reply {
  readonly nonce: string;
  readonly action: Action;
  readonly value: string;
}

/** What a provider asks the pane to show. `kind` picks a row of the pane's kinds table. */
export interface PaneRequest {
  readonly kind: string;
  readonly prompt: string;
  /** the thing asked about, shown prominently: a key, a command, a tool call; may be empty */
  readonly subject: string;
  /** whether the typed characters are hidden; false when the pane has no field at all */
  readonly masked: boolean;
}

/** What the consumer handed the binary. */
export interface Input {
  /** the words after the kind: sudo, ssh and git put the prompt text first */
  readonly argv: readonly string[];
  /** the consumer's environment: ssh says what kind of prompt this is in `SSH_ASKPASS_PROMPT` */
  readonly env: Env;
  readonly namespace: string;
  /** stdin, read when a provider asks (decide); never read otherwise */
  readonly stdin: () => string;
}

/** One consumer. Adding a kind is one of these plus one row in `index.ts` and one in the pane. */
export interface Provider {
  /** the environment variables `askpass enable` prints for it; a `LINK` value is the executable path of `qsm-askpass-<kind>`, which install links because a consumer takes a path with no arguments; empty when it has no link */
  readonly env: readonly (readonly [name: string, value: string])[];
  /** argv and stdin to what the pane shows; throws a SecretError for input it cannot use */
  request: (input: Input) => PaneRequest;
  /** the person's answer to the consumer's result: stdout is the outcome's message */
  finish: (input: Input, reply: Reply) => Outcome;
}
