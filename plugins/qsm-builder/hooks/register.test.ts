// claude plugin test plugins/qsm-builder: exercises register.tsx's two hooks
// against the engine itself (claude-code/testing), not the predicate in lib/,
// which lib/manifest-check.test.ts covers under plain `bun test`.
//
// The path is the plugin, not hooks/: the runner looks for hooks/hooks.json
// under the directory it is given. It then also tries this plugin's plain bun
// test files and reports each as "cannot import bun:test", which is the shape
// of a bun test file and not a failure of these; `bun test plugins/qsm-builder`
// runs those, and bunfig.toml keeps it out of hooks/.
//
// The brief hook is proved here too: which tool call reaches which verb, once per plugin per
// session, and what the model is told. What the verb says is lib/lens/brief.ts's, run by the cli test.
//
// What only this file can prove: that a violation comes back as `{ deny }`
// instead of reaching the tool, that a path other than plugin.json is not
// checked at all, that the Edit branch reads the file and checks the text the
// edit would leave, and that a file it cannot read passes through.
//
// Each test supplies the bottom of the chain itself. `tool.call` is a chain
// event, so the bottom hook returns the tool's own result shape; `fs.read` is
// a host operation, which nothing beneath the plugins answers, so a test that
// needs one returns `{ value }` from an `on("fs.read", ...)` of its own.
import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

const VALID = JSON.stringify({
  name: "qsm-example",
  version: "0.1.0",
  description: "One capability, described in one sentence.",
  author: { name: "qsm" },
  keywords: ["example"],
});

const MANIFEST = "/repo/plugins/qsm-example/.claude-plugin/plugin.json";

/** The bottom of the chain: the tool itself, counted so a test can tell a
 * call that reached it from one the hook refused. */
function tools(on: On, reached: { count: number }) {
  on("tool.call", { tool: "Write" }, (_$, e) => {
    reached.count += 1;
    return {
      result: {
        type: "create" as const,
        filePath: e.file_path,
        content: e.content,
        structuredPatch: [],
        originalFile: null,
      },
    };
  });
  on("tool.call", { tool: "Edit" }, (_$, e) => {
    reached.count += 1;
    return {
      result: {
        filePath: e.file_path,
        oldString: e.old_string,
        newString: e.new_string,
        originalFile: null,
        structuredPatch: [],
        userModified: false,
        replaceAll: e.replace_all ?? false,
      },
    };
  });
}

test("a Write of a manifest with hooks null is denied, and the denial names it", async ($, on) => {
  const reached = { count: 0 };
  tools(on, reached);

  const r = await $.tool.call({
    tool: "Write",
    file_path: MANIFEST,
    content: JSON.stringify({ ...JSON.parse(VALID), hooks: null }),
  });

  expect(r.deny).toContain("hooks must be omitted rather than set to null");
  expect(r.deny).toContain(MANIFEST);
  expect(reached.count).toBe(0);
});

test("a Write of a valid manifest reaches the tool", async ($, on) => {
  const reached = { count: 0 };
  tools(on, reached);

  const r = await $.tool.call({ tool: "Write", file_path: MANIFEST, content: VALID });

  expect(r.deny).toBeUndefined();
  expect(reached.count).toBe(1);
});

test("a Write of a file not named plugin.json is not checked", async ($, on) => {
  const reached = { count: 0 };
  tools(on, reached);

  const r = await $.tool.call({
    tool: "Write",
    file_path: "/repo/plugins/qsm-example/README.md",
    content: "{ not a manifest, and not even JSON",
  });

  expect(r.deny).toBeUndefined();
  expect(reached.count).toBe(1);
});

test("an Edit that spoils the version is denied on the text it would leave", async ($, on) => {
  const reached = { count: 0 };
  tools(on, reached);
  on("fs.read", () => ({ value: VALID }));

  const r = await $.tool.call({
    tool: "Edit",
    file_path: MANIFEST,
    old_string: '"version":"0.1.0"',
    new_string: '"version":"v1"',
  });

  expect(r.deny).toContain("dotted triple");
  expect(reached.count).toBe(0);
});

test("an Edit whose old text is not in the file reaches the tool, which reports it", async ($, on) => {
  const reached = { count: 0 };
  tools(on, reached);
  on("fs.read", () => ({ value: VALID }));

  const r = await $.tool.call({
    tool: "Edit",
    file_path: MANIFEST,
    old_string: '"version":"9.9.9"',
    new_string: '"version":"v1"',
  });

  expect(r.deny).toBeUndefined();
  expect(reached.count).toBe(1);
});

test("an Edit of a manifest the hook cannot read reaches the tool", async ($, on) => {
  const reached = { count: 0 };
  tools(on, reached);
  on("fs.read", () => ({ deny: "no such file" }));

  const r = await $.tool.call({
    tool: "Edit",
    file_path: MANIFEST,
    old_string: '"version":"0.1.0"',
    new_string: '"version":"v1"',
  });

  expect(r.deny).toBeUndefined();
  expect(reached.count).toBe(1);
});

// The brief hook. `process.run`, `session.id`, `ui.log` and `ui.toast` are host operations, so each
// test supplies them; the tool at the bottom answers every Read, Write and Edit as a success.

const PLUGIN_FILE = "/repo/plugins/qsm-web/skills/web-ladder/SKILL.md";
const BRIEF =
  "qsm-web has 1 open tasks from the lens and from feedback.\n- qsm-1 (edit) qsm-web: x";

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>;
type Engine = Parameters<Body>[0];

/** What the brief verb prints under --json: `data` on ok, or a failure with `message`. */
function printed(answer: { readonly text: string | null } | { readonly failed: string }) {
  const failed = "failed" in answer;
  const envelope = failed
    ? { code: "missing", exit: 4, message: answer.failed, data: null }
    : { code: "ok", exit: 0, message: "", data: { plugin: "qsm-web", text: answer.text } };
  return {
    value: {
      stdout: JSON.stringify({ ...envelope, reason: "", warnings: [] }),
      stderr: "",
      exitCode: envelope.exit,
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  };
}

function briefHost(on: On, answer: { readonly text: string | null } | { readonly failed: string }) {
  const seen = { runs: [] as string[], toasts: [] as string[], logs: [] as string[] };
  on("tool.call", () => ({ result: "tool output", text: "tool output" }));
  on("session.id", () => ({ value: "s1" }));
  on("ui.toast", (_$, e) => {
    seen.toasts.push(e.text);
    return { value: undefined };
  });
  on("ui.log", (_$, e) => {
    seen.logs.push(e.text);
    return { value: undefined };
  });
  on("process.run", (_$, e) => {
    seen.runs.push(e.argv.join(" "));
    return printed(answer);
  });
  return seen;
}

const read = ($: Engine, filePath: string) => $.tool.call({ tool: "Read", file_path: filePath });

test("the first read of a plugin's file tells the model its open tasks, once per plugin", async ($, on) => {
  const seen = briefHost(on, { text: BRIEF });

  const first = await read($, PLUGIN_FILE);
  const same = await read($, "/repo/plugins/qsm-web/README.md");
  const other = await read($, "/repo/plugins/qsm-tasks/README.md");

  expect(seen.runs).toEqual([
    `qsm-builder lens brief ${PLUGIN_FILE} --json`,
    "qsm-builder lens brief /repo/plugins/qsm-tasks/README.md --json",
  ]);
  expect(first.context).toEqual([BRIEF]);
  expect(first.text).toBe("tool output");
  expect(same.context).toBeUndefined();
  expect(other.context).toEqual([BRIEF]);
});

test("a write or an edit of a plugin's file is told too, a file outside plugins is not", async ($, on) => {
  const seen = briefHost(on, { text: BRIEF });

  const edit = await $.tool.call({
    tool: "Edit",
    file_path: PLUGIN_FILE,
    old_string: "a",
    new_string: "b",
  });
  await read($, "/repo/src/main.ts");
  await read($, "relative/plugins/x.ts");

  expect(edit.context).toEqual([BRIEF]);
  expect(seen.runs).toHaveLength(1);
});

test("a plugin with no open edit or feedback adds nothing and is not asked again", async ($, on) => {
  const seen = briefHost(on, { text: null });

  const first = await read($, PLUGIN_FILE);
  await read($, PLUGIN_FILE);

  expect(first.context).toBeUndefined();
  expect(seen.runs).toHaveLength(1);
});

test("a verb that fails toasts its cause, logs it and leaves the result as the tool made it", async ($, on) => {
  const seen = briefHost(on, { failed: "br is not on PATH. Install qsm-tasks." });

  const r = await read($, PLUGIN_FILE);

  expect(r.text).toBe("tool output");
  expect(r.context).toBeUndefined();
  expect(seen.toasts).toHaveLength(1);
  expect(seen.toasts[0]).toMatch(/^qsm-builder ERROR: tool\.call: .*qsm-tasks/);
  expect(seen.logs[0]).toContain(PLUGIN_FILE);
});

test("a refused manifest write is not briefed", async ($, on) => {
  const seen = briefHost(on, { text: BRIEF });

  const r = await $.tool.call({
    tool: "Write",
    file_path: "/repo/plugins/qsm-web/.claude-plugin/plugin.json",
    content: "{}",
  });

  expect(r.deny).toBeDefined();
  expect(seen.runs).toEqual([]);
});
