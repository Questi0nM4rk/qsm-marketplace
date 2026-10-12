// `claude plugin test plugins/qsm-essentials` drives register.tsx against the engine itself: which
// spawns are refused, what a started agent's description says, and how its transcript row is drawn.
import { expect, test } from "claude-code/testing";

const SPAWN = {
  tool_use_id: "t1",
  prompt: "find X",
  description: "researcher: find X",
  subagentType: "qsm-essentials:researcher",
  parentModel: "claude-opus-5-5",
  background: true,
  fork: false,
  provider: { plugin: "engine", tier: "core" },
} as const;

test("an Agent call without a model is refused with the tiers named", async ($, on) => {
  let started = 0;
  on("agent.spawn", () => {
    started += 1;
    return { agentId: "a1", model: "claude-opus-5-5" };
  });

  const r = await $.agent.spawn(SPAWN);

  expect(r.deny).toContain("haiku, sonnet, opus or fable");
  expect(started).toBe(0);
});

test("a fork needs no model", async ($, on) => {
  on("agent.spawn", (_$, e) => ({ agentId: "a1", model: e.parentModel }));

  const r = await $.agent.spawn({ ...SPAWN, fork: true });

  expect(r.deny).toBeUndefined();
});

test("a named model puts its tier in front of the description", async ($, on) => {
  const descriptions: string[] = [];
  on("agent.spawn", (_$, e) => {
    descriptions.push(e.description);
    return { agentId: "a1", model: "claude-sonnet-5-5" };
  });

  await $.agent.spawn({ ...SPAWN, model: "sonnet" });
  await $.agent.spawn({ ...SPAWN, model: "haiku", description: "[haiku] runner: bun test" });

  expect(descriptions).toEqual(["[sonnet] researcher: find X", "[haiku] runner: bun test"]);
});

test("an Agent call's transcript row starts with its tier in the tier's colour", async ($, on) => {
  // The engine's own row, beneath the plugin's.
  on("ui.render", { component: "ToolUse" }, (engine, e) => {
    const { Text } = engine.ui.resolve(e);
    return <Text>Agent(x)</Text>;
  });
  const props = {
    tool_use_id: "t1",
    tool: "Agent",
    input: { model: "claude-sonnet-5-5", description: "x", prompt: "y" },
    isRunning: true,
    isErrored: false,
    isInterrupted: false,
  };

  const row = await $.ui.mount({
    plugin: "qsm-essentials",
    surface: "terminal",
    component: "ToolUse",
    props,
  });
  const bash = await $.ui.mount({
    plugin: "qsm-essentials",
    surface: "terminal",
    component: "ToolUse",
    props: { ...props, tool: "Bash", input: { command: "ls" } },
  });

  expect(JSON.stringify(await row.drawn())).toContain('"color":"cyan"');
  expect(JSON.stringify(await row.drawn())).toContain("sonnet");
  expect(JSON.stringify(await bash.drawn())).not.toContain("cyan");
});
