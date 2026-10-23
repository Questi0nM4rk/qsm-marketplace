// qsm-forge's function-hooks module: the noun, `$.forge`, from gh and gl verbs, generated from
// qsm.json, so another module reaches a pull or merge request's threads without shelling out; and
// the guard that refuses a raw platform call reading or changing review state; and the git guard
// that refuses the git and gh forms the git rule names. The decisions are reviewGuard and gitGuard,
// pure functions of the command line in lib/; only a push asks git whether the upstream is ahead.

import type { On } from "claude-code";
import { reviewGuard } from "../lib/forge-guard.ts";
import { BEHIND_REFUSAL, gitGuard, pushesWithoutPull } from "../lib/git-guard.ts";
import { failure, registerNoun } from "./noun.generated.ts";

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
    const reason = failure($, "tool.call", next.error);
    return { deny: `qsm-forge: the review guard failed (${reason}); the call was not run` };
  });

  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    const refusal = gitGuard(e.command);
    if (refusal !== null) {
      return { deny: refusal };
    }
    if (!pushesWithoutPull(e.command)) {
      return next(e);
    }
    const cwd = await $.session.cwd();
    await $.process.run(["git", "fetch", "--quiet"], { cwd });
    const ahead = await $.process.run(["git", "rev-list", "--count", "HEAD..@{u}"], { cwd });
    return ahead.exitCode === 0 && Number(ahead.stdout.trim()) > 0
      ? { deny: BEHIND_REFUSAL }
      : next(e);
  }).catch(($, _e, next) => {
    const reason = failure($, "tool.call", next.error);
    return { deny: `qsm-forge: the git guard failed (${reason}); the call was not run` };
  });
}
