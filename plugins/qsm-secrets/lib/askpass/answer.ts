// The consumers that ask for a value and take it on stdout (sudo -A, ssh, git) answer the same way:
// the person's text on Allow, nothing and exit 1 otherwise. One factory, so each is a few lines.

import { fail, type Outcome, ok } from "../../../../lib/outcome.ts";
import type { Input, PaneRequest, Provider, Reply } from "./types.ts";

/** What the person did when the reply is no allow, as a reason. */
export function reasonOf(reply: Reply): string {
  return reply.action === "deny" ? "denied by the person" : "cancelled by the person";
}

/** The outcome of a reply that is no allow. */
export function refusal(reply: Reply): Outcome {
  return fail("failed", reasonOf(reply));
}

interface AnswerOnce {
  readonly kind: string;
  /** the variables `askpass enable` prints */
  readonly env: Provider["env"];
  /** whether the typed characters are hidden for this prompt */
  readonly masked: (prompt: string) => boolean;
}

export function answerOnce(spec: AnswerOnce): Provider {
  return {
    env: spec.env,
    request: (input: Input): PaneRequest => {
      const prompt = input.argv[0] ?? "Password:";
      return { kind: spec.kind, prompt, subject: "", masked: spec.masked(prompt) };
    },
    finish: (_input, reply) => {
      if (reply.action !== "allow") {
        return refusal(reply);
      }
      return reply.value === "" ? fail("failed", "nothing was typed") : ok(undefined, reply.value);
    },
  };
}
