// `claude plugin test plugins/qsm-index` drives register.tsx against the engine itself: which
// native event reaches which verb of $.index, with which argv, and what the session is told. What
// each verb does is proved by `bun test` in scripts/session-start.test.ts and
// scripts/refresh.test.ts; nothing here re-tests it. `process.run`, `session.cwd`, `ui.log` and
// `ui.toast` are host operations, so the test supplies them with `on(<name>, ...)` returning
// `{ value }`, and the test's own `on('session.start')`, `on('prompt.submit')` and `on('tool.call')` are the bottoms of
// their chains.
import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>;
type Engine = Parameters<Body>[0];

/** What every qsm-index call answers: ok with `data`, or failed with `message`. */
type Answer = { readonly data?: unknown } | { readonly failed: string };

const NOT_ON_PATH = "qsm-index could not start a background build: qsm-index is not on PATH";
const START = { cwd: "/repo/src", surface: null, isInteractive: false } as const;

/** The stdout and exit qsm-index has under --json for an answer. */
function printed(answer: Answer): { stdout: string; exitCode: number } {
  const failed = "failed" in answer;
  const envelope = failed
    ? { code: "failed", exit: 1, message: answer.failed, data: null }
    : { code: "ok", exit: 0, message: "", data: answer.data ?? null };
  return {
    stdout: JSON.stringify({ ...envelope, reason: "", warnings: [] }),
    exitCode: envelope.exit,
  };
}

/** The host under register.tsx: the chain bottoms, `ui.*`, the session's cwd, and, unless
 * `answer` is null, a `process.run` that answers it. A tool that fails answers `isError`. Records
 * each argv run, each toast and each tool call that reached the bottom. */
function host(on: On, answer: Answer | null = {}, toolFails = false) {
  const seen = { runs: [] as string[], toasts: [] as string[], logs: [] as string[], tools: 0 };
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("prompt.submit", (_$, e) => ({ text: e.text, context: e.context }));
  on("tool.call", (_$, _e) => {
    seen.tools += 1;
    return { result: "tool output", text: "tool output", ...(toolFails ? { isError: true } : {}) };
  });
  on("session.cwd", () => ({ value: "/repo" }));
  on("ui.log", (_$, e) => {
    seen.logs.push(e.text);
    return { value: undefined };
  });
  on("ui.toast", (_$, e) => {
    seen.toasts.push(e.text);
    return { value: undefined };
  });
  if (answer !== null) {
    on("process.run", (_$, e) => {
      seen.runs.push(e.argv.join(" "));
      return {
        value: {
          ...printed(answer),
          stderr: "",
          isStdoutTruncated: false,
          isStderrTruncated: false,
        },
      };
    });
  }
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
  const seen = host(on, {}, true);

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

test("a refresh in a deleted session cwd names the directory, not a missing binary", async ($, on) => {
  const seen = host(on, null);
  on("process.run", () => {
    throw new Error("ENOENT: no such file or directory, posix_spawn 'qsm-index'");
  });
  on("fs.exists", () => ({ value: false }));

  await bash($, "git commit -m x");

  expect(seen.toasts).toHaveLength(1);
  expect(seen.logs[0]).toContain("the session's working directory /repo no longer exists");
});
