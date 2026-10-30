// qsm-ccr's function-hooks module: the noun, and the session start that keeps CCR's copy of
// codex's tokens and models under a day old. Every rule is the verb's; the sync detaches inside
// the verb, so the hook only starts it.
import type { On } from "claude-code";
import { failure, registerNoun } from "./noun.generated.ts";

export function register(on: On): void {
  registerNoun(on);

  on("session.start", async ($, e, next) => {
    await $.ccr.sync({ ifStale: true, detach: true });
    return next(e);
  }).catch(($, e, next) => {
    failure($, "session.start", next.error);
    return next(e);
  });
}
