// `qsm-usage toon wrap`: the conversion behind the tool.call hook, which has no runtime of its own
// to parse YAML or TOML.

import type { Handler } from "../../../lib/cli-base.ts";
import { fail, ok } from "../../../lib/outcome.ts";
import { messageOf } from "../lib/formats.ts";
import { wrapDecision } from "../lib/wrap.ts";
import { readStdin } from "./count.ts";

export const wrap: Handler = async (call) => {
  if (call.args.stdin !== true) {
    return fail("usage", "no input: pass --stdin and the text on standard input");
  }
  try {
    const decision = wrapDecision(await readStdin());
    return ok(decision, decision.toon ?? `keep the original: ${decision.reason}`);
  } catch (error) {
    return fail("failed", messageOf(error));
  }
};
