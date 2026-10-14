// SSH_ASKPASS: ssh runs this with its prompt as the first word and reads the answer from stdout.
// `SSH_ASKPASS_PROMPT` says what it asks: nothing set is a passphrase or a question with a typed
// answer (a secret is masked, a question is not); `confirm` is a yes/no that ssh reads as exit 0 or
// not, with no text; `none` is a notice (a touch to make), which only needs showing.

import { ok } from "../../../../../lib/outcome.ts";
import { answerOnce, refusal } from "../answer.ts";
import type { Provider } from "../types.ts";

const typed = answerOnce({
  kind: "ssh",
  env: [
    ["SSH_ASKPASS", "LINK"],
    ["SSH_ASKPASS_REQUIRE", "prefer"],
  ],
  masked: (prompt) => /pass(word|phrase)|pin\b|token/i.test(prompt),
});

export const ssh: Provider = {
  ...typed,
  request: (input) => {
    const mode = input.env.SSH_ASKPASS_PROMPT;
    if (mode === "confirm" || mode === "none") {
      return {
        kind: mode === "confirm" ? "decide" : "notice",
        prompt: input.argv[0] ?? "",
        subject: "",
        masked: false,
      };
    }
    return typed.request(input);
  },
  finish: (input, reply) => {
    const mode = input.env.SSH_ASKPASS_PROMPT;
    if (mode === "none") {
      return ok(undefined, "");
    }
    if (mode === "confirm") {
      return reply.action === "allow" ? ok(undefined, "") : refusal(reply);
    }
    return typed.finish(input, reply);
  },
};
