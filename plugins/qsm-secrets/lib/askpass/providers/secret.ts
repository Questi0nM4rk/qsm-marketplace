// `qsm-secrets set <key> --gui`: the pane is the prompt, and the value goes to the backend on stdin,
// never to the caller. Nothing is printed but the key.

import { ok, fail as stop } from "../../../../../lib/outcome.ts";
import { activeBackend } from "../../backend.ts";
import { fail } from "../../errors.ts";
import { refusal } from "../answer.ts";
import type { Provider } from "../types.ts";

function keyOf(argv: readonly string[]): string {
  const [key] = argv;
  return key ?? fail("askpass secret takes <key>", "run qsm-secrets set <key> --gui", "usage");
}

export const secret: Provider = {
  env: [],
  request: (input) => ({
    kind: "secret",
    prompt: "A new secret is asked for",
    subject: `${input.namespace}/${keyOf(input.argv)}`,
    masked: true,
  }),
  finish: (input, reply) => {
    if (reply.action !== "allow") {
      return refusal(reply);
    }
    const key = keyOf(input.argv);
    if (reply.value === "") {
      return stop("failed", "nothing was typed, nothing stored");
    }
    const backend = activeBackend();
    backend.store(input.namespace, key, new TextEncoder().encode(reply.value));
    // Read back only to measure: an empty entry left in the vault would make `has` answer yes.
    if ((backend.read(input.namespace, key)?.length ?? 0) === 0) {
      backend.remove(input.namespace, key);
      return stop("failed", "the backend kept no value, nothing stored");
    }
    return ok({ namespace: input.namespace, key, stored: true }, `stored ${key}`);
  },
};
