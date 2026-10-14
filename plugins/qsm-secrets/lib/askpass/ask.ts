// One question to the person: the provider says what to show, the pane shows it, the answer comes
// back on a socket only this call listens on, and the provider turns it into the consumer's result.

import { readFileSync } from "node:fs";
import { type Outcome, fail as stop } from "../../../../lib/outcome.ts";
import { callerOf } from "./caller.ts";
import { providerOf } from "./index.ts";
import { dismissPane, showPane } from "./pane.ts";
import { openReplySocket } from "./socket.ts";
import type { Input } from "./types.ts";

const SIGNALS = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 } as const;

/** How long the person has before the call fails, matching the pane's own clock. */
export const TIMEOUT_MS = 120_000;

export interface AskOptions {
  readonly env: Record<string, string | undefined>;
  readonly namespace: string;
  readonly timeoutMs?: number;
  /** who the pane names as asking; the parent of this process unless a test says otherwise */
  readonly callerPid?: number;
  readonly stdin?: () => string;
}

export async function ask(
  kind: string,
  argv: readonly string[],
  options: AskOptions,
): Promise<Outcome> {
  const provider = providerOf(kind);
  let text: string | undefined;
  const read = options.stdin ?? (() => readFileSync(0, "utf8"));
  const input: Input = {
    argv,
    env: options.env,
    namespace: options.namespace,
    stdin: () => {
      text ??= read();
      return text;
    },
  };
  const request = provider.request(input);
  const socket = openReplySocket(options.env);
  // ssh kills its askpass after a notice, and Ctrl-C reaches it at a prompt: the request leaves the
  // screen and the socket directory goes, as on any other exit.
  const stops = Object.entries(SIGNALS).map(([name, number]) => {
    const onSignal = (): void => {
      dismissPane(options.env, socket.nonce);
      socket.close();
      process.exit(128 + number);
    };
    process.on(name, onSignal);
    return () => process.off(name, onSignal);
  });
  try {
    const caller = callerOf(options.callerPid ?? process.ppid);
    await showPane(options.env, {
      ...request,
      nonce: socket.nonce,
      socketPath: socket.path,
      timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
      requestedBy: caller,
    });
    const reply = await socket.wait(options.timeoutMs ?? TIMEOUT_MS);
    return reply === null
      ? stop("failed", "timed out waiting for the person")
      : provider.finish(input, reply);
  } finally {
    for (const release of stops) {
      release();
    }
    dismissPane(options.env, socket.nonce);
    socket.close();
  }
}
