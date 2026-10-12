// At session start the bin farm relinks itself when this machine opted in (setup.json autoRelink).
import type { On } from "claude-code";
import { registerNoun } from "./noun.generated.ts";
import { readRelinkOutput } from "./relink-output.ts";

export function register(on: On): void {
  registerNoun(on);
  on("session.start", async ($, e, next) => {
    const r = await $.process.run(["qsm-setup", "relink", "--auto", "--json"], { cwd: e.cwd });
    if (r.exitCode === 0) {
      const output = readRelinkOutput(r.stdout);
      if (output.kind === "relinked") {
        $.ui.toast("qsm-setup: bin farm relinked");
      } else if (output.kind === "unreadable") {
        $.ui.toast(`qsm-setup ERROR: session.start: ${output.reason}`);
        $.ui.log(`relink answered unexpectedly; stdout: ${r.stdout.slice(0, 500)}`);
      }
    } else {
      $.ui.toast(
        `qsm-setup ERROR: session.start: relink exited ${r.exitCode}: ${r.stderr.slice(0, 120)}`,
      );
      $.ui.log(`relink exited ${r.exitCode}; stdout: ${r.stdout}; stderr: ${r.stderr}`);
    }
    return next(e);
  }).catch(($, e, next) => {
    const reason = `${next.error.kind}${next.error.message === undefined ? "" : `: ${next.error.message.slice(0, 120)}`}`;
    $.ui.toast(`qsm-setup ERROR: session.start: ${reason}`);
    $.ui.log(`session.start relink skipped (${next.error.kind})`);
    return next(e);
  });
}
