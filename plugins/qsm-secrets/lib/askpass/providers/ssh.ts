// SSH_ASKPASS: ssh runs this with its prompt as the first word, for a passphrase or a yes/no, and
// reads the answer from stdout. A prompt that asks for a secret is masked; a question is not.

import { answerOnce } from "../answer.ts";

export const ssh = answerOnce({
  kind: "ssh",
  env: [
    ["SSH_ASKPASS", "LINK"],
    ["SSH_ASKPASS_REQUIRE", "prefer"],
  ],
  masked: (prompt) => /pass(word|phrase)|pin\b|token/i.test(prompt),
});
