// GIT_ASKPASS: git runs this with `Username for '<url>': ` or `Password for '<url>': ` as the first
// word and reads the answer from stdout. Only the password is masked.

import { answerOnce } from "../answer.ts";

export const git = answerOnce({
  kind: "git",
  env: [["GIT_ASKPASS", "LINK"]],
  masked: (prompt) => /pass(word|phrase)|token/i.test(prompt),
});
