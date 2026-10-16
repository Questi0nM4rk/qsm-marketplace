// `qsm-usage toon wrap`: the conversion behind the tool.call hook, which has no runtime of its own
// to parse YAML or TOML.

import { flagArg, type Handler, readStdin } from "../../../lib/cli-base.ts";
import { fail, ok } from "../../../lib/outcome.ts";
import { wrapDecision } from "../lib/wrap.ts";

export const wrap: Handler = async (call) => {
  if (!flagArg(call, "stdin")) {
    return fail("usage", "no input: pass --stdin and the text on standard input");
  }
  const decision = wrapDecision(await readStdin());
  return ok(decision, decision.toon ?? `keep the original: ${decision.reason}`);
};
