// `claude plugin test plugins/qsm-index` drives register.tsx against the engine itself: which
// native event reaches which verb of $.index, with which argv, and what the session is told. What
// each verb does is proved by `bun test` in scripts/session-start.test.ts and
// scripts/refresh.test.ts; nothing here re-tests it. `process.run`, `session.cwd`, `fs.exists`, `ui.log` and
// `ui.toast` are host operations, so the test supplies them with `on(<name>, ...)` returning
// `{ value }`, and the test's own `on('session.start')`, `on('prompt.submit')` and `on('tool.call')` are the bottoms of
// their chains.
import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";
import { printed, recordingHost } from "./host.generated.ts";

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>;
type Engine = Parameters<Body>[0];

/** What every qsm-index call answers: ok with `data`, or failed with `message`. */
type Answer = { readonly data?: unknown } | { readonly failed: string };

const NOT_ON_PATH = "qsm-index could not start a background build: qsm-index is not on PATH";
const START = { cwd: "/repo/src", surface: null, isInteractive: false } as const;

/** What qsm-index prints under --json for an answer. */
const answered = (answer: Answer) =>
  "failed" in answer
    ? printed("failed", 1, answer.failed)
    : printed("ok", 0, "", answer.data ?? null);

/** The host under register.tsx: the chain bottoms, `ui.*`, the session's cwd, whether it still
 * exists, and, unless `answer` is null, a `process.run` that answers it. A tool that fails answers
 * `isError`; `toolText` is what every tool answers. Records each argv run, each toast and each tool call that reached the bottom. */
function host(
  on: On,
  answer: Answer | null = {},
  { toolFails = false, cwdExists = true, toolText = "tool output" } = {},
) {
  const seen = Object.assign(
    recordingHost(on, answer === null ? undefined : () => answered(answer)),
    { tools: 0 },
  );
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("prompt.submit", (_$, e) => ({ text: e.text, context: e.context }));
  on("tool.call", (_$, _e) => {
    seen.tools += 1;
    return { result: toolText, text: toolText, ...(toolFails ? { isError: true } : {}) };
  });
  on("session.cwd", () => ({ value: "/repo" }));
  on("fs.exists", () => ({ value: cwdExists }));
  return seen;
}

function prompt($: Engine) {
  return $.prompt.submit({ text: "hello", wait: false, origin: { kind: "composer" } });
}

function bash($: Engine, command: string) {
  return $.tool.call({ tool: "Bash", command });
}

test("a session start runs auto for its directory and the first prompt carries the ask text", async ($, on) => {
  const seen = host(on, { data: { answer: "ask", askText: "Ask the person." } });

  await $.session.start(START);
  const first = await prompt($);
  const second = await prompt($);

  expect(seen.runs).toEqual(["qsm-index auto /repo/src --json"]);
  expect(first.context).toEqual(["Ask the person."]);
  expect(second.context).toBeUndefined();
});

test("a session start whose auto answers without an ask adds no context", async ($, on) => {
  host(on, { data: { answer: "fresh", repo: "/repo" } });

  await $.session.start(START);
  const r = await prompt($);

  expect(r.context).toBeUndefined();
});

test("a build auto could not start reaches the first prompt as one context line and a toast", async ($, on) => {
  const seen = host(on, { failed: NOT_ON_PATH });

  await $.session.start(START);
  const r = await prompt($);

  expect(r.context).toEqual([`qsm-index auto: failed: ${NOT_ON_PATH}`]);
  expect(seen.toasts).toHaveLength(1);
  expect(seen.toasts[0]).toMatch(/^qsm-index ERROR: session\.start:/);
});

test("a git commit through Bash starts a refresh for the session's cwd", async ($, on) => {
  const seen = host(on);

  const r = await bash($, "git add . && git commit -m 'one more'");
  await bash($, "(git commit -qm x)");

  expect(r.text).toBe("tool output");
  expect(seen.runs).toEqual(
    Array.from({ length: 2 }, () => "qsm-index reindex /repo --if-indexed --json"),
  );
});

test("a Bash call that does not commit starts nothing", async ($, on) => {
  const seen = host(on);

  for (const command of [
    "git status",
    "git log --oneline",
    "echo commit",
    "ls git",
    "git commit-tree",
  ]) {
    await bash($, command);
  }

  expect(seen.tools).toBe(5);
  expect(seen.runs).toEqual([]);
});

test("a commit that failed starts no refresh", async ($, on) => {
  const seen = host(on, {}, { toolFails: true });

  await bash($, "git commit -m x");

  expect(seen.runs).toEqual([]);
});

test("an edit hands the edited verb the file and the session's cwd", async ($, on) => {
  const seen = host(on);

  await $.tool.call({ tool: "Write", file_path: "/repo/a.ts", content: "" });
  await $.tool.call({ tool: "Edit", file_path: "b.ts", old_string: "a", new_string: "b" });
  await $.tool.call({
    tool: "NotebookEdit",
    notebook_path: "/repo/n.ipynb",
    new_source: "",
  });
  await $.tool.call({ tool: "Read", file_path: "/repo/a.ts" });

  expect(seen.runs).toEqual([
    "qsm-index edited /repo/a.ts --cwd /repo --json",
    "qsm-index edited b.ts --cwd /repo --json",
    "qsm-index edited /repo/n.ipynb --cwd /repo --json",
  ]);
});

test("a refresh that cannot start toasts and leaves the tool's result as it was", async ($, on) => {
  const seen = host(on, { failed: NOT_ON_PATH });

  const r = await bash($, "git commit -m x");

  expect(r.text).toBe("tool output");
  expect(seen.tools).toBe(1);
  expect(seen.toasts).toHaveLength(1);
  expect(seen.toasts[0]).toMatch(/^qsm-index ERROR: tool\.call:/);
});

test("a hook that throws toasts the event and the tool still runs once", async ($, on) => {
  // process.run is left unstubbed: the harness throws "no implementation for process.run" into
  // the refresh, which the hook catches.
  const seen = host(on, null);

  const r = await $.tool.call({
    tool: "Edit",
    file_path: "/repo/a.ts",
    old_string: "a",
    new_string: "b",
  });

  expect(r.text).toBe("tool output");
  expect(seen.tools).toBe(1);
  expect(seen.toasts).toHaveLength(1);
  expect(seen.toasts[0]).toMatch(/^qsm-index ERROR: tool\.call:/);
});

test("a refresh log names the cwd it ran in and the spawn's cause", async ($, on) => {
  // process.run is left unstubbed: its rejection is what a spawn in a deleted cwd looks like.
  const seen = host(on, null);

  await bash($, "git commit -m x");

  expect(seen.logs).toHaveLength(1);
  expect(seen.logs[0]).toContain("tool.call refresh failed open in /repo:");
  expect(seen.logs[0]).toContain("process.run");
});

test("a commit in a session cwd that was removed runs no verb and shows nothing", async ($, on) => {
  const seen = host(on, {}, { cwdExists: false });

  const r = await bash($, "git commit -m x");

  expect(r.text).toBe("tool output");
  expect(seen.runs).toEqual([]);
  expect(seen.toasts).toEqual([]);
  expect(seen.logs).toEqual([]);
});

/** Answers each `qsm-index wait` as the verb does: `waiting for <repo>` on stderr, then, once
 * `together` waits were spawned, its --json answer. Records each argv it was spawned with. */
function waiter(on: On, repo: string, answer: Answer, together = 1): string[] {
  const spawns: string[] = [];
  let release = () => {};
  const all = new Promise<void>((done) => {
    release = done;
  });
  on("process.spawn", async function* (_$, e) {
    spawns.push(e.argv.join(" "));
    if (spawns.length >= together) release();
    yield { stream: "stderr" as const, text: `waiting for ${repo}\n` };
    await all;
    yield { stream: "stdout" as const, text: answered(answer).stdout };
    return { value: { code: 0, signal: null } };
  });
  return spawns;
}

/** Lets the waiters the hook started beside the session finish: each dispatch yields to them, and
 * a Bash call that does not commit runs no verb. */
async function settled($: Engine, toasts: readonly string[]): Promise<void> {
  for (let i = 0; i < 100 && toasts.length === 0; i++) {
    await bash($, "true");
  }
  for (let i = 0; i < 5; i++) {
    await bash($, "true");
  }
}

const INDEXED = "qsm-index: /repo indexed at 1a2b3c4d5e6f in 173 s";
const FAILED = "qsm-index: build of /work/big failed: graphify exited 1";

test("a commit that started a build tells the person and the next prompt when it ends", async ($, on) => {
  const seen = host(on, { data: "started a build of /repo" });
  const spawns = waiter(on, "/repo", { data: INDEXED });

  await bash($, "git commit -m x");
  await settled($, seen.toasts);
  const r = await prompt($);

  expect(spawns).toHaveLength(1);
  expect(spawns[0]).toMatch(/^qsm-index wait \/repo --since \d{4}-\d\d-\d\dT\S+ --json$/);
  expect(seen.toasts).toEqual([INDEXED]);
  expect(r.context).toEqual([INDEXED]);
});

test("an MCP reindex whose build failed is told with the cause", async ($, on) => {
  const seen = host(on, {}, { toolText: "started a build of /work/big" });
  const spawns = waiter(on, "/work/big", { failed: FAILED });

  await $.tool.call({ tool: "mcp__plugin_qsm-index_qsm-index__reindex", path: "/work/big" });
  await settled($, seen.toasts);

  expect(spawns.map((argv) => argv.split(" --since")[0])).toEqual(["qsm-index wait /work/big"]);
  expect(seen.toasts).toEqual([FAILED]);
});

test("one build asked for from two paths of its repository is told once", async ($, on) => {
  const seen = host(
    on,
    { data: "started a build of /repo" },
    {
      toolText: "a build of /repo is already running since 2026-10-30T12:00:00.000Z",
    },
  );
  const spawns = waiter(on, "/repo", { data: INDEXED }, 2);

  await bash($, "git commit -m x");
  await $.tool.call({ tool: "mcp__plugin_qsm-index_qsm-index__reindex", path: "/repo/src" });
  await settled($, seen.toasts);
  const r = await prompt($);

  expect(spawns).toHaveLength(2);
  expect(seen.toasts).toEqual([INDEXED]);
  expect(r.context).toEqual([INDEXED]);
});

test("a graph answer that only quotes a build in its body starts no wait", async ($, on) => {
  const seen = host(
    on,
    {},
    { toolText: "node a.ts\nrunning: a build of /repo is already running" },
  );

  await $.tool.call({ tool: "mcp__plugin_qsm-index_qsm-index__structure", repo: "/repo" });
  await settled($, seen.toasts);

  expect(seen.toasts).toEqual([]);
});
