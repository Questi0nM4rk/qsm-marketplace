// `claude plugin test` drives the cockpit against the engine: a started agent shows on a chip in its
// tier's colour, the main agent's edit moves the stage, and an answered question lands in the pane.

import type { On } from "claude-code";
import { type Engine, expect, mock, test } from "claude-code/testing";

// The engine beneath the plugin: a clock, and a band or pane it would draw itself.
function beneath(on: On): void {
  mock.clock(on);
  on("ui.render", (engine, e) => {
    const { Text } = engine.ui.resolve(e);
    return <Text>engine</Text>;
  });
}

type CallArgs = Parameters<Engine["tool"]["call"]>[0];

// A call made inside an agent's loop. The engine takes `agentId` on every call, but the generated
// ToolCallArgs omits it, so the field is added on a variable, which no excess-property check reads.
function inLoop(args: CallArgs, agentId: string): CallArgs {
  const call = { ...args, agentId };
  return call;
}

const SPAWN = {
  tool_use_id: "t1",
  prompt: "sleep 20",
  description: "[haiku] runner: sleep 20",
  subagentType: "qsm-essentials:runner",
  parentModel: "claude-opus-5-5",
  model: "haiku",
  background: true,
  fork: false,
  provider: { plugin: "engine", tier: "core" },
} as const;

const PANE = {
  plugin: "qsm-cockpit",
  surface: "terminal",
  component: "Pane",
  requestId: "qsm-cockpit",
  props: {
    title: "qsm cockpit",
    isFocused: true,
    bodyColumns: 100,
    placement: "dock",
    scroll: { bodyRows: 30, offset: 0 },
    view: {},
  },
} as const;

/** The engine's spawn, naming each started agent a1, a2, … in order. */
function numberedAgents(on: On, model: string): void {
  let n = 0;
  on("agent.spawn", () => {
    n += 1;
    return { agentId: `a${n}`, model };
  });
}

/** The engine's Bash: `reached` settles once `count` calls arrived; each call returns after `release`. */
function heldBash(on: On, count: number) {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived = 0;
  let reachedAll: () => void = () => {};
  const reached = new Promise<void>((resolve) => {
    reachedAll = resolve;
  });
  on("tool.call", async (_engine, e) => {
    if (e.tool !== "Bash") {
      return { result: {} };
    }
    arrived += 1;
    if (arrived === count) {
      reachedAll();
    }
    await held;
    return { result: {} };
  });
  return {
    reached,
    release: () => {
      release();
    },
  };
}

const BAND = {
  hasSurvey: false,
  isWorking: true,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { bodyRows: 9, offset: 0 },
  view: {},
};

/** The band above the prompt as the engine draws it now, as one string. */
async function drawnBand($: Engine): Promise<string> {
  const band = await $.ui.mount({
    plugin: "qsm-cockpit",
    surface: "terminal",
    component: "AbovePrompt",
    props: BAND,
  });
  return JSON.stringify(await band.drawn());
}

/** The pane as the engine draws it now, with its dropdowns shut: the mount to press on, and what it drew. */
async function shutPane($: Engine) {
  const pane = await $.ui.mount(PANE);
  return { pane, shut: JSON.stringify(await pane.drawn()) };
}

test("a running haiku agent sits on a green chip, and the stage tool puts the band on EXECUTE", async ($, on) => {
  beneath(on);
  on("agent.spawn", () => ({ agentId: "a1", model: "haiku" }));
  on("tool.call", () => ({ result: {} }));

  await $.agent.spawn(SPAWN);
  await $.tool.call({
    tool: "mcp__qsm-cockpit__stage",
    stage: "EXECUTE",
    doing: "spec-apply cockpit",
  });
  const drawn = await drawnBand($);

  expect(drawn).toContain('"backgroundColor":"green"');
  expect(drawn).toContain("[haiku] runner: sleep 20");
  expect(drawn).toContain(
    '"backgroundColor":"blue","color":"white","bold":true},"children":[" EXECUTE "]',
  );
  expect(drawn).toContain("└ spec-apply cockpit");
});

test("answered questions sit in the pane under the typed ask, behind its dropdown", async ($, on) => {
  beneath(on);
  on("prompt.submit", (_engine, e) => ({ text: e.text }));
  on("tool.call", () => ({
    result: { answers: { "Where?": "Band and pane", "Home?": "Dev mod" } },
  }));

  await $.prompt.submit({ text: "make a cockpit mod", wait: false, origin: { kind: "composer" } });
  await $.tool.call({
    tool: "AskUserQuestion",
    questions: [
      { question: "Where?", header: "Place", multiSelect: false, options: [] },
      { question: "Home?", header: "Home", multiSelect: false, options: [] },
    ],
  });
  const { pane, shut } = await shutPane($);

  expect(shut).toContain("▸ make a cockpit mod  (2)");
  expect(shut).not.toContain("Band and pane");

  await pane.press({ key: "ask:0" });
  const open = JSON.stringify(await pane.drawn());

  expect(open).toContain('"  Where? "]},"Band and pane"');
  expect(open).toContain('"  Home? "]},"Dev mod"');
});

test("the band shows what each agent runs and never the main chat's commands, the pane hides finished agents", async ($, on) => {
  beneath(on);
  numberedAgents(on, "haiku");
  const bash = heldBash(on, 2);
  on("turn.complete", () => ({ text: "" }));
  await $.agent.spawn(SPAWN);
  await $.agent.spawn({ ...SPAWN, description: "[haiku] runner: bun test" });
  await $.turn.complete({
    answer: "done",
    durationMs: 31_000,
    isAborted: false,
    turnId: "t",
    agentId: "a2",
    reason: "answer",
  });
  await $.tool.call({ tool: "Edit", file_path: "/x.ts", old_string: "a", new_string: "b" });
  // Two calls that run now: one inside agent a1's loop, one in the main chat. Neither returns yet.
  const inAgent = $.tool.call(inLoop({ tool: "Bash", command: "sleep 20" }, "a1"));
  const inMain = $.tool.call({ tool: "Bash", command: "bun run lint" });
  await bash.reached;
  const band = await drawnBand($);
  const { pane, shut } = await shutPane($);

  expect(band).toContain("Bash sleep 20");
  expect(band).not.toContain("bun run lint");
  expect(band).not.toContain("runner: bun test");
  expect(shut).toContain("▸ 1 finished");
  expect(shut).not.toContain("bun run lint");
  expect(shut).not.toContain("runner: bun test");

  await pane.press({ key: "done" });
  expect(JSON.stringify(await pane.drawn())).toContain("runner: bun test");

  bash.release();
  await Promise.all([inAgent, inMain]);
  expect(JSON.stringify(await pane.drawn())).toContain("└ thinking");
});

test("a shell command shows without what only frames it", async ($, on) => {
  beneath(on);
  numberedAgents(on, "haiku");
  const bash = heldBash(on, 1);

  await $.agent.spawn(SPAWN);
  const call = $.tool.call(
    inLoop(
      {
        tool: "Bash",
        command: "cd /tmp && set -o pipefail && (sleep 30 && echo done) 2>&1 | tee /tmp/x.log",
      },
      "a1",
    ),
  );
  await bash.reached;
  const drawn = await drawnBand($);
  bash.release();
  await call;

  expect(drawn).toContain("Bash sleep 30 && echo done ·");
});

test("the stage tool answers what the stage asks, and every prompt carries where the chat stands", async ($, on) => {
  beneath(on);
  const seen: string[][] = [];
  on("prompt.submit", (_engine, e) => {
    seen.push([...(e.context ?? [])]);
    return { text: e.text };
  });
  on("agent.spawn", () => ({ agentId: "a1", model: "sonnet" }));

  await $.prompt.submit({ text: "hi", wait: false, origin: { kind: "composer" } });
  const answer = await $.tool.call({
    tool: "mcp__qsm-cockpit__stage",
    stage: "VERIFY",
    doing: "bun test",
  });
  const wrong = await $.tool.call({ tool: "mcp__qsm-cockpit__stage", stage: "SHIP" });
  await $.prompt.submit({ text: "next", wait: false, origin: { kind: "composer" } });
  await $.agent.spawn({ ...SPAWN, model: "sonnet" });
  await $.tool.call(inLoop({ tool: "mcp__qsm-cockpit__stage", stage: "LOAD" }, "a1"));
  const band = await drawnBand($);

  expect(seen[0]?.join(" ")).toContain("qsm stage: not said yet");
  expect(String(answer.result)).toContain("Next: LEARN");
  expect(String(wrong.result)).toContain("stage must be one of");
  expect(seen[1]?.join(" ")).toContain("qsm stage: VERIFY");
  expect(seen[1]?.join(" ")).toContain("bun test");
  expect(band).toContain('" VERIFY "');
  expect(band).toContain("LOAD · starting");
});

test("a failing tasks verb toasts qsm-cockpit ERROR and the session still starts", async ($, on) => {
  beneath(on);
  const toasts: string[] = [];
  let toasted: () => void = () => {};
  const arrived = new Promise<void>((resolve) => {
    toasted = resolve;
  });
  on("session.start", (_engine, e) => ({ cwd: e.cwd }));
  on("command.register", () => ({ value: { command: "cockpit" } }));
  on("tool.register", () => ({ value: { tool: "stage" } }));
  on("process.run", () => ({
    value: {
      exitCode: 4,
      stdout: "",
      stderr: "br did not run",
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }));
  on("ui.log", () => ({ value: undefined }));
  on("ui.toast", (_engine, e) => {
    toasts.push(e.text);
    toasted();
    return { value: undefined };
  });

  await $.session.start({ cwd: "/repo", surface: null, isInteractive: false });
  await arrived;

  expect(toasts).toHaveLength(1);
  expect(toasts[0]).toMatch(/^qsm-cockpit ERROR: tasks: .*\(exit 4\)/);
});
