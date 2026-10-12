// claude plugin test plugins/qsm-langdev: drives register.tsx against the engine itself. What only
// this file proves: the guard's deny rides `tool.call` and its ask rides `tool.check`, and the edit
// hook hands the `edited` verb's text back as the result's context. The rule behind the guard is
// lib/blocked-git.test.ts, the verb is scripts/edit-hook.test.ts. `process.run`, `session.id` and
// `ui.*` are host operations the test answers itself.
import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

const FINDINGS = "qsm-langdev on notes.md against HEAD (+ marks what this tree added):\n+ MD018";
const SKIPPING = "git commit --no-verify -m x";

const created = (filePath: string, content: string) => ({
  result: { type: "create" as const, filePath, content, structuredPatch: [], originalFile: null },
});

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>;

/** A Write of one file, the call every edit test makes. */
const write = ($: Parameters<Body>[0]) =>
  $.tool.call({ tool: "Write", file_path: "/repo/notes.md", content: "x\n" });

/** The bottom of the chain, and every verb argv the module ran. */
function host(on: On, answer: { exit: number; data: unknown } = { exit: 0, data: { text: null } }) {
  const runs: string[] = [];
  on("tool.call", { tool: "Bash" }, () => ({
    result: { stdout: "", stderr: "", interrupted: false, isImage: false },
  }));
  on("tool.call", { tool: "Write" }, (_$, e) => created(e.file_path, e.content));
  on("session.id", () => ({ value: "s1" }));
  on("ui.log", () => ({ value: undefined }));
  on("ui.toast", () => ({ value: undefined }));
  on("process.run", (_$, e) => {
    runs.push(e.argv.join(" "));
    const stdout = JSON.stringify({
      code: "ok",
      exit: answer.exit,
      message: "",
      data: answer.data,
    });
    const flags = { isStdoutTruncated: false, isStderrTruncated: false };
    return { value: { exitCode: answer.exit, stdout, stderr: "", ...flags } };
  });
  return runs;
}

test("a commit that skips the git hooks is denied with the way to ask", async ($, on) => {
  host(on);

  const r = await $.tool.call({ tool: "Bash", command: SKIPPING });

  expect(r.deny).toContain("QSM_LANGDEV_ALLOW");
});

test("an ordinary commit runs and is not put to the person", async ($, on) => {
  host(on);

  const r = await $.tool.call({ tool: "Bash", command: "git commit -m x" });
  const check = await $.tool.check({ tool: "Bash", input: { command: "git commit -m x" } });

  expect(r.deny).toBeUndefined();
  expect(check.reason ?? "").not.toContain("a person decides");
});

test("QSM_LANGDEV_ALLOW is put to the person", async ($, on) => {
  host(on);

  const check = await $.tool.check({
    tool: "Bash",
    input: { command: 'QSM_LANGDEV_ALLOW="known" git commit -m x' },
  });

  expect(check.decision).toBe("ask");
  expect(check.reason).toContain("a person decides");
});

test("a Write gets the findings back as context, with the file and who edited", async ($, on) => {
  const runs = host(on, { exit: 0, data: { text: FINDINGS } });

  const r = await write($);

  expect(r.context).toEqual([FINDINGS]);
  expect(runs).toEqual(["qsm-langdev edited /repo/notes.md --session s1 --json"]);
});

test("a Write with nothing to say carries no context", async ($, on) => {
  host(on);

  const r = await write($);

  expect(r.context).toBeUndefined();
});

test("a verb that fails leaves the Write's result as it was", async ($, on) => {
  host(on, { exit: 1, data: null });

  const r = await write($);

  expect(r.deny).toBeUndefined();
  expect(r.context).toBeUndefined();
});
