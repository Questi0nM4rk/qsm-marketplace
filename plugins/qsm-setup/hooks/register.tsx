// At session start the bin farm relinks itself when this machine opted in (setup.json autoRelink).
import type { On } from "claude-code";
import { failure, registerNoun } from "./noun.generated.ts";

export function register(on: On): void {
  registerNoun(on);
  on("session.start", async ($, e, next) => {
    const data = await $.setup.relink({ auto: true });
    if (typeof data === "object" && data !== null && "relinked" in data && data.relinked === true) {
      $.ui.toast("qsm-setup: bin farm relinked");
    }
    return next(e);
  }).catch(($, e, next) => {
    failure($, "session.start", next.error);
    return next(e);
  });
}
