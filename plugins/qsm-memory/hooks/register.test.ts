// `claude plugin test plugins/qsm-memory` drives register.tsx against the engine itself: which
// native event reaches which verb of $.memory, with which argv, and what the session is told. What
// each verb does is proved by `bun test` in scripts/hooks.test.ts; nothing here re-tests it.
// `process.run`, `session.cwd`, `ui.log` and `ui.toast` are host operations the test answers
// itself, and its own `on('session.*')` and `on('prompt.submit')` are the bottoms of the chains.
import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>;
type Engine = Parameters<Body>[0];

const BRIEFING =
  "Last sessions here:\n- 2026-10-04 Wire the briefing (3 user turns)\n" +
  "In progress:\n- qsm-1.2 finish the gate (epic qsm-1 Briefing)\n" +
  "Search: qsm-memory search <words>, then qsm-memory show <id>";

const SUMMARY = { role: "user" as const, text: "summary", toolUses: [] };
const START = { cwd: "/work", surface: null, isInteractive: false } as const;
const SAVE = "run qsm-memory save --catch-up --detach --json";
const ORIENT_RUN = "run qsm-memory orient --cwd /work --json";

/** The envelope each verb prints, by verb word; a verb not named here answers ok with no data. */
const ENVELOPES: Readonly<
  Record<string, { code: string; exit: number; message: string; data: unknown }>
> = {
  orient: { code: "ok", exit: 0, message: BRIEFING, data: { text: BRIEFING } },
};

/** Everything the module reached for, in order: `run <argv>`, `log <text>`, `toast <text>`. */
function record(on: On, envelopes = ENVELOPES): string[] {
  const trail: string[] = [];
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("session.end", (_$, e) => ({ sessionId: e.sessionId }));
  on("session.compact", () => ({ messages: [SUMMARY] }));
  on("prompt.submit", (_$, e) => ({ text: e.text, context: e.context }));
  on("session.cwd", () => ({ value: "/work" }));
  on("ui.log", (_$, e) => {
    trail.push(`log ${e.text}`);
    return { value: undefined };
  });
  on("ui.toast", (_$, e) => {
    trail.push(`toast ${e.text}`);
    return { value: undefined };
  });
  on("process.run", (_$, e) => {
    trail.push(`run ${e.argv.join(" ")}`);
    const printed = envelopes[e.argv[1] ?? ""] ?? { code: "ok", exit: 0, message: "", data: null };
    const stdout = JSON.stringify({ ...printed, reason: "", warnings: [] });
    const flags = { isStdoutTruncated: false, isStderrTruncated: false };
    return { value: { exitCode: printed.exit, stdout, stderr: "", ...flags } };
  });
  return trail;
}

const runs = (trail: readonly string[]) => trail.filter((line) => line.startsWith("run "));

function prompt($: Engine) {
  return $.prompt.submit({ text: "hello", wait: false, origin: { kind: "composer" } });
}

function end($: Engine, reason: "clear" | "other") {
  return $.session.end({ sessionId: "s1", reason, resume: {} as never });
}

test("a session start starts the catch-up save and the first prompt carries the briefing", async ($, on) => {
  const trail = record(on);

  await $.session.start(START);
  const r = await prompt($);

  expect(runs(trail)).toEqual([SAVE, ORIENT_RUN]);
  const [context] = r.context ?? [];
  expect(r.context).toHaveLength(1);
  expect(context).toBe(BRIEFING);
});

test("the briefing comes with the first prompt only", async ($, on) => {
  const trail = record(on);

  await $.session.start(START);
  await prompt($);
  const second = await prompt($);

  expect(second.context).toBeUndefined();
  expect(runs(trail).filter((line) => line.includes(" orient "))).toHaveLength(1);
});

test("the first prompt after a /clear carries the briefing again", async ($, on) => {
  const trail = record(on);

  await $.session.start(START);
  await prompt($);
  await end($, "clear");
  const r = await prompt($);

  expect(r.context?.[0]).toBe(BRIEFING);
  expect(runs(trail)).toEqual([SAVE, ORIENT_RUN, SAVE, ORIENT_RUN]);
});

test("the first prompt after a compaction carries the briefing again", async ($, on) => {
  record(on);

  await $.session.start(START);
  await prompt($);
  await $.session.compact({ trigger: "manual", messages: [SUMMARY] });
  const r = await prompt($);

  expect(r.context?.[0]).toBe(BRIEFING);
});

test("a session end of any other reason saves and owes no briefing", async ($, on) => {
  const trail = record(on);

  await $.session.start(START);
  await prompt($);
  await end($, "other");
  const r = await prompt($);

  expect(r.context).toBeUndefined();
  expect(runs(trail)).toEqual([SAVE, ORIENT_RUN, SAVE]);
});

test("a catch-up that cannot start toasts the event and the briefing still comes", async ($, on) => {
  const save = { code: "missing", exit: 4, message: "qsm-memory is not on PATH", data: null };
  const trail = record(on, { ...ENVELOPES, save });

  await $.session.start(START);
  const r = await prompt($);

  expect(trail.filter((line) => line.startsWith("toast "))).toEqual([
    "toast qsm-memory ERROR: session.start: qsm-memory save: missing: qsm-memory is not on PATH",
  ]);
  expect(trail).toContain(
    "log session.start failed open (throw): qsm-memory save: missing: qsm-memory is not on PATH",
  );
  expect(r.context?.[0]).toBe(BRIEFING);
});

test("a prompt whose briefing cannot be built toasts and still enters", async ($, on) => {
  const orient = { code: "failed", exit: 1, message: "no archive", data: null };
  const trail = record(on, { ...ENVELOPES, orient });

  await $.session.start(START);
  const r = await prompt($);

  expect(r.text).toBe("hello");
  expect(trail.filter((line) => line.startsWith("toast "))).toEqual([
    expect.stringMatching(/^toast qsm-memory ERROR: prompt\.submit:/),
  ]);
});
