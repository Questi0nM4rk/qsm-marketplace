// qsm-essentials' function-hooks module: every agent names its model, and the transcript shows it;
// no Bash call sends a job to the background with `&`. The rules are lib/agent-model.ts and
// lib/bash-background.ts; the hooks only refuse, tag and draw.
import type { On } from "claude-code";
import { NO_MODEL, TIER_COLOR, tagged, tierOf } from "../lib/agent-model.ts";
import { backgroundDenial } from "../lib/bash-background.ts";

export function register(on: On): void {
  on("tool.call", { tool: "Bash" }, (_$, e, next) => {
    const denial = backgroundDenial(e.command);
    return denial === null ? next(e) : { deny: denial };
  });

  on("agent.spawn", (_$, e, next) => {
    if (e.fork) {
      return next(e);
    }
    if (e.model === undefined || e.model === "") {
      return { deny: NO_MODEL };
    }
    // A workflow agent's content cannot be rewritten; the engine would log the attempt.
    return e.workflow === undefined
      ? next({ ...e, description: tagged(e.description, e.model) })
      : next(e);
  });

  on("ui.render", { component: "ToolUse" }, async ($, e, next) => {
    const { input } = e.props;
    const model =
      e.props.tool === "Agent" && typeof input === "object" && input !== null && "model" in input
        ? input.model
        : undefined;
    if (typeof model !== "string") {
      return next(e);
    }
    const tier = tierOf(model);
    const { Box, Text } = $.ui.resolve(e);
    return (
      <Box flexDirection="row">
        <Text color={TIER_COLOR[tier] ?? "gray"} weight="semibold">
          {tier}{" "}
        </Text>
        {await next(e)}
      </Box>
    );
  });
}
