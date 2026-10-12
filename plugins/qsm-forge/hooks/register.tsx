// qsm-forge's function-hooks module: the noun, `$.forge`, from gh and gl verbs, generated from
// qsm.json, so another module reaches a pull or merge request's threads without shelling out; and
// the guard that refuses a raw platform call reading or changing review state. The decision is
// reviewGuard, a pure function of the command line in lib/.

import type { On } from "claude-code";
import { reviewGuard } from "../lib/forge-guard.ts";
import { registerNoun } from "./noun.generated.ts";

export function register(on: On): void {
  registerNoun(on);

  on("tool.call", { tool: "Bash" }, ($, e, next) => {
    const refusal = reviewGuard(e.command);
    if (refusal === null) {
      return next(e);
    }
    $.ui.log(`refused a raw review call (${e.command.slice(0, 120)})`);
    return { deny: refusal };
  }).catch(($, _e, next) => {
    const reason = `${next.error.kind}${next.error.message === undefined ? "" : `: ${next.error.message.slice(0, 120)}`}`;
    $.ui.toast(`qsm-forge ERROR: tool.call: ${reason}`);
    $.ui.log(`the review guard failed (${next.error.kind}); the call was denied`);
    return { deny: `qsm-forge: the review guard failed (${reason}); the call was not run` };
  });
}
