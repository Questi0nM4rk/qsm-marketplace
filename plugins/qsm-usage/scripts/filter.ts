// `qsm-usage filter`: the command output filter's answer for a Bash command, for the tool.call
// hook, which cannot start a process of its own to speak the filter's protocol.

import { spawnSync } from "node:child_process";
import { flagArg, type Handler, requiredString } from "../../../lib/cli-base.ts";
import { ok } from "../../../lib/outcome.ts";
import { filterBin } from "../lib/doctor.ts";
import { FILTER_HOOK_ARGS, filterAnswer, NO_ANSWER, runsGit } from "../lib/filter.ts";

export const filter: Handler = (call) => {
  const command = requiredString(call, "command");
  if (flagArg(call, "subagent") && runsGit(command)) {
    return ok(NO_ANSWER, "");
  }
  const payload = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } };
  const ran = spawnSync(filterBin(process.env), [...FILTER_HOOK_ARGS], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
  // A filter that is not on PATH is no error: the call runs as it was.
  const answer =
    ran.error === undefined
      ? filterAnswer({ status: ran.status ?? 1, stdout: ran.stdout, stderr: ran.stderr })
      : NO_ANSWER;
  return ok(answer, answer.command ?? answer.deny ?? "");
};
