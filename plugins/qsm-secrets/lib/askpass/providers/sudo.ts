// SUDO_ASKPASS: sudo -A runs this with its prompt as the first word and reads the password from stdout.

import { answerOnce } from "../answer.ts";

export const sudo = answerOnce({
  kind: "sudo",
  env: [["SUDO_ASKPASS", "LINK"]],
  masked: () => true,
});
