// claude plugin test plugins/qsm-usage: the ledger's scenarios, driven through
// the engine's own chain, on the host test-host.tsx stubs.
import type { On, SessionMessage } from "claude-code";
import { type Engine, expect, test } from "claude-code/testing";
import { isPlainObject } from "../lib/toon-scalar.ts";
import {
  newSeen,
  sessionIn,
  stdoutOf,
  stringsIn,
  type Store,
  stubHost,
  stubStore,
} from "./test-host.tsx";

const PROMPT_TEXT = "PRIVATE-PROMPT-TEXT do not keep me";
const ANSWER_TEXT = "PRIVATE-ANSWER-TEXT";

const START = { cwd: "/repo", surface: null, isInteractive: false } as const;
const TURN_USAGE = {
  model: "claude-test",
  input_tokens: 100,
  output_tokens: 20,
  cache_read_input_tokens: 900,
  cache_creation_input_tokens: 10,
};

/** No tool_use blocks unless a test sets its own; the ledger's turn.complete
 * reads this every main-thread turn. */
function stubMessages(on: On, messages: () => SessionMessage[]): void {
  on("session.messages", () => ({ value: messages() }));
}

/** The chain's bottom for every injection event: each passes its text on. */
function answerInjections(on: On): void {
  on("prompt.attachment", (_$, e) => ({ text: e.text }));
  on("tool.describe", (_$, e) => ({ description: e.description }));
  on("skill.prompt", (_$, e) => ({ text: e.text }));
  on("session.measure", (_$, e) => ({ changed: e.changed }));
}

async function injectEach($: Engine): Promise<void> {
  await $.prompt.attachment({
    type: "todo_reminder",
    text: PROMPT_TEXT,
    origin: { kind: "engine" },
  });
  await $.tool.describe({
    tool: "Bash",
    description: "runs commands",
    provider: { plugin: "engine", tier: "core" },
  });
  await $.skill.prompt({ skill: "tdd", text: PROMPT_TEXT });
}

async function threeTurns($: Engine): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await $.turn.complete({
      answer: ANSWER_TEXT,
      durationMs: 1000,
      isAborted: false,
      turnId: `t${i}`,
      reason: "answer",
      usage: TURN_USAGE,
    });
    await $.session.measure({
      rateLimits: [],
      context: { window: 200_000 },
      cost: { usd: 0.1 * (i + 1) },
      changed: ["cost"],
    });
  }
}

test("A session ends", async ($, on) => {
  const store: Store = new Map();
  stubStore(on, store);
  stubHost(on, "s1");
  stubMessages(on, () => []);
  answerInjections(on);

  await $.session.start(START);
  await injectEach($);
  await threeTurns($);
  await $.session.end({ sessionId: "s1", reason: "other", resume: { id: "s1" } });

  const rec = sessionIn(store, "s1");
  expect(store.get("sessions")).toEqual(["s1"]);
  expect(rec.start?.categories.length).toBe(4);
  expect(rec.turns.length).toBe(3);
  expect(rec.turns.map((t) => t.usage)).toEqual([TURN_USAGE, TURN_USAGE, TURN_USAGE]);
  expect(rec.turns.map((t) => t.costUsd)).toEqual([0.1, 0.2, 0.300_000_000_000_000_04]);
  expect(rec.injected).toContainEqual(
    expect.objectContaining({ source: "prompt.attachment", name: "todo_reminder" }),
  );
  expect(rec.injected).toContainEqual(
    expect.objectContaining({ source: "tool.describe", name: "Bash", chars: 13 }),
  );
  expect(rec.injected).toContainEqual(
    expect.objectContaining({ source: "skill.prompt", name: "tdd" }),
  );
  expect(rec.uses.skills).toEqual({ tdd: 1 });
  const serialized = JSON.stringify([...store.values()]);
  expect(serialized.includes("PRIVATE")).toBe(false);
});

test("Two turns: the second counts only the tool_use blocks its own messages added", async ($, on) => {
  const store: Store = new Map();
  stubStore(on, store);
  stubHost(on, "s2", newSeen());
  let messages: SessionMessage[] = [];
  stubMessages(on, () => messages);

  await $.session.start(START);

  messages = [
    { role: "user", text: "run it", toolUses: [] },
    {
      role: "assistant",
      text: "",
      toolUses: [
        { tool_use_id: "1", tool: "Bash", input: {} },
        { tool_use_id: "2", tool: "Read", input: {} },
      ],
    },
  ];
  await $.turn.complete({
    answer: ANSWER_TEXT,
    durationMs: 1000,
    isAborted: false,
    turnId: "t0",
    reason: "answer",
    usage: TURN_USAGE,
  });

  messages = [
    ...messages,
    { role: "user", text: "again", toolUses: [] },
    { role: "assistant", text: "", toolUses: [{ tool_use_id: "3", tool: "Bash", input: {} }] },
  ];
  await $.turn.complete({
    answer: ANSWER_TEXT,
    durationMs: 1000,
    isAborted: false,
    turnId: "t1",
    reason: "answer",
    usage: TURN_USAGE,
  });

  const rec = sessionIn(store, "s2");
  expect(Object.entries(rec.uses.tools).sort(([a], [b]) => a.localeCompare(b))).toEqual([
    ["Bash", 2],
    ["Read", 1],
  ]);
});

/** Rows well past the verb's ~4,000-character ask threshold. */
function listing(rows: number): string {
  return Array.from(
    { length: rows },
    (_, i) => `- number: ${i + 1}\n  title: Fix the thing number ${i + 1} properly\n`,
  ).join("");
}

const TOON = "[400]{number,title}:\n  1,Fix the thing number 1 properly";
const TOON_ANSWER = {
  use: "toon",
  format: "yaml",
  originalTokens: 6500,
  toonTokens: 2100,
  toon: TOON,
};

const NO_REWRITE = { command: null, deny: null };

/** The chain's bottoms for a tool call whose result is `result`, and a `process.run` that answers
 * each `qsm-usage` verb with `answers[<second word>]` as the verb's data (the filter, by default,
 * has nothing to say; `filter: undefined` makes it fail). Records the argv and stdin of each run,
 * and the command the tool was finally called with. */
function toolHost(on: On, sessionId: string, result: unknown, answers: Record<string, unknown>) {
  const store: Store = new Map();
  stubStore(on, store);
  stubHost(on, sessionId);
  stubMessages(on, () => []);
  const verbs: Record<string, unknown> = { filter: NO_REWRITE, ...answers };
  const seen = {
    store,
    runs: [] as { argv: string; stdin?: string }[],
    commands: [] as unknown[],
  };
  on("tool.call", (_$, e) => {
    seen.commands.push("command" in e ? e.command : undefined);
    return { result, text: "model text" };
  });
  on("process.run", (_$, e) => {
    seen.runs.push({ argv: e.argv.join(" "), stdin: e.init?.stdin });
    const name = e.argv[1];
    const data = name === undefined ? undefined : verbs[name];
    const code = data === undefined ? "failed" : "ok";
    const envelope = { code, exit: data === undefined ? 1 : 0, message: "", reason: "", data };
    return {
      value: {
        stdout: JSON.stringify({ ...envelope, warnings: [] }),
        stderr: "",
        exitCode: envelope.exit,
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });
  return seen;
}

/** The runs that asked the toon verb: the filter's own are not what these tests are about. */
function toonRuns(seen: { runs: { argv: string; stdin?: string }[] }) {
  return seen.runs.filter((r) => r.argv.startsWith("qsm-usage toon"));
}

function bashResult(stdout: string) {
  return { stdout, stderr: "", interrupted: false };
}

test("A large listing from a wrapped command reaches the model as TOON and the ledger records the saving", async ($, on) => {
  const raw = listing(400);
  const seen = toolHost(on, "s5", bashResult(raw), { toon: TOON_ANSWER });

  await $.session.start(START);
  const ran = await $.tool.call({ tool: "Bash", command: "gh pr list --json number,title" });
  await $.session.end({ sessionId: "s5", reason: "other", resume: { id: "s5" } });

  expect(stdoutOf(ran.result)).toBe(
    `[qsm-toon: YAML -> TOON, 6.5k -> 2.1k tokens; raw: QSM_TOON=0 gh pr list --json number,title]\n${TOON}`,
  );
  expect(toonRuns(seen)).toEqual([{ argv: "qsm-usage toon wrap --stdin --json", stdin: raw }]);
  const rec = sessionIn(seen.store, "s5");
  expect(rec.toon).toEqual([
    { pattern: "gh * --json *", count: 1, fromTokens: 6500, toTokens: 2100 },
  ]);
});

test("A short result reaches the model unchanged and nothing is asked", async ($, on) => {
  const seen = toolHost(on, "s6", bashResult("short output"), {});

  const ran = await $.tool.call({ tool: "Bash", command: "gh pr list --json number" });

  expect(stdoutOf(ran.result)).toBe("short output");
  expect(toonRuns(seen)).toEqual([]);
});

test("A file printed with cat is never offered", async ($, on) => {
  const seen = toolHost(on, "s7", bashResult(listing(400)), { toon: TOON_ANSWER });

  await $.tool.call({ tool: "Bash", command: "qsm-index status --json | cat" });

  expect(toonRuns(seen)).toEqual([]);
});

test("An MCP tool's large result reaches the model as TOON, told how to turn it off", async ($, on) => {
  const seen = toolHost(on, "s8", listing(400), { toon: TOON_ANSWER });

  // The typed tool names are the ones this repo's plugins declare; any other server's is loose.
  const ran = await $.tool.call({ tool: "mcp__qsm-index__search" });

  expect(ran.result).toBe(
    `[qsm-toon: YAML -> TOON, 6.5k -> 2.1k tokens; raw: drop "mcp__*" from the qsm-usage toonWrap option]\n${TOON}`,
  );
  expect(toonRuns(seen)).toHaveLength(1);
});

test(
  "The wrap list is the plugin's own toonWrap option",
  { options: { toonWrap: ["mine --json"] } },
  async ($, on) => {
    const seen = toolHost(on, "s9", bashResult(listing(400)), { toon: TOON_ANSWER });

    await $.tool.call({ tool: "Bash", command: "gh pr list --json number" });
    await $.tool.call({ tool: "Bash", command: "mine --json" });

    expect(toonRuns(seen)).toHaveLength(1);
  },
);

test("A verb that fails leaves the output unchanged", async ($, on) => {
  toolHost(on, "s10", bashResult(listing(400)), {});

  const ran = await $.tool.call({ tool: "Bash", command: "gh pr list --json number" });

  expect(stdoutOf(ran.result)).toBe(listing(400));
});

test("The command output filter's rewrite is the command the tool runs", async ($, on) => {
  const seen = toolHost(on, "s11", bashResult("ok"), {
    filter: { command: "rtk git status", deny: null },
  });

  await $.tool.call({ tool: "Bash", command: "git status" });

  expect(seen.runs.map((r) => r.argv)).toEqual(["qsm-usage filter --command git status --json"]);
  expect(seen.commands).toEqual(["rtk git status"]);
});

test("A command the filter rewrote is still matched against the wrap list as written", async ($, on) => {
  const seen = toolHost(on, "s15", bashResult(listing(400)), {
    toon: TOON_ANSWER,
    filter: { command: "rtk gh pr list --json number", deny: null },
  });

  const ran = await $.tool.call({ tool: "Bash", command: "gh pr list --json number" });

  expect(seen.commands).toEqual(["rtk gh pr list --json number"]);
  expect(stdoutOf(ran.result)).toContain(TOON);
});

test("A filter with nothing to say runs the command as written", async ($, on) => {
  const seen = toolHost(on, "s12", bashResult("ok"), { filter: { command: null, deny: null } });

  await $.tool.call({ tool: "Bash", command: "echo hi" });

  expect(seen.commands).toEqual(["echo hi"]);
});

test("A filter that denies ends the call, the tool never runs", async ($, on) => {
  const seen = toolHost(on, "s13", bashResult("ok"), {
    filter: { command: null, deny: "not here" },
  });

  const ran = await $.tool.call({ tool: "Bash", command: "echo hi" });

  expect(ran.deny).toContain("not here");
  expect(seen.commands).toEqual([]);
});

test("A filter that cannot be asked runs the command as written", async ($, on) => {
  const seen = toolHost(on, "s14", bashResult("ok"), { filter: undefined });

  const ran = await $.tool.call({ tool: "Bash", command: "echo hi" });

  expect(ran.isError).toBeUndefined();
  expect(seen.commands).toEqual(["echo hi"]);
});

test("The store is full", async ($, on) => {
  const store: Store = new Map();
  const old = Array.from({ length: 200 }, (_, i) => `old${i}`);
  store.set("sessions", old);
  for (const id of old) {
    store.set(`session:${id}`, { id, turns: [] });
  }
  stubStore(on, store);
  stubHost(on, "new");

  await $.session.start(START);
  await $.session.end({ sessionId: "new", reason: "other", resume: { id: "new" } });

  const index = stringsIn(store, "sessions");
  expect(index.length).toBe(200);
  expect(index[0]).toBe("old1");
  expect(index[199]).toBe("new");
  expect(store.has("session:old0")).toBe(false);
  expect(store.has("session:new")).toBe(true);
});

test("Recording fails", async ($, on) => {
  const store: Store = new Map();
  const seen = newSeen();
  stubStore(on, store, true);
  stubHost(on, "s3", seen);
  stubMessages(on, () => []);
  on("prompt.attachment", (_$, e) => ({ text: e.text }));

  const started = await $.session.start(START);
  const section = await $.prompt.attachment({
    type: "todo_reminder",
    text: "kept as is",
    origin: { kind: "engine" },
  });
  const turn = await $.turn.complete({
    answer: "done",
    durationMs: 1,
    isAborted: false,
    turnId: "t1",
    reason: "answer",
    usage: TURN_USAGE,
  });

  expect(started).toEqual({ cwd: "/repo" });
  expect(section).toEqual({ text: "kept as is" });
  expect(turn.text).toBe("done");
  // The engine names the plugin before every log line, so the line itself starts with the event.
  const errors = seen.logs.filter((l) => l.includes(" failed: "));
  expect(errors.length).toBe(1);
  expect(errors[0]).toStartWith("session.start failed: ");
});

test("The breakdown and ledger tools answer from the summary breakdown and the recorded sessions", async ($, on) => {
  const store: Store = new Map();
  const seen = newSeen();
  stubStore(on, store);
  stubHost(on, "s4", seen);

  await $.session.start(START);
  const breakdown = await $.tool.call({ tool: "mcp__qsm-usage__breakdown" });
  const ledger = await $.tool.call({ tool: "mcp__qsm-usage__ledger", sessions: 5 });

  expect(seen.registered).toEqual(["breakdown", "ledger"]);
  expect(String(breakdown.result)).toContain("Messages,27000,used");
  expect(String(ledger.result)).toContain("s4");
  expect(seen.usageArgs.length).toBeGreaterThan(0);
  expect(seen.usageArgs.every((a) => isPlainObject(a) && a.breakdown === "summary")).toBe(true);
});
