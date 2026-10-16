// `claude plugin test plugins/qsm-setup` drives register.tsx's session.start
// hook against the engine itself, so the wiring is proved rather than
// assumed. `$`'s only callable methods are EventCalls's ten namespaces
// (tool, command, config, prompt, skill, attribution, agent, session, turn,
// ui); everything else this module calls (`process.run`, `ui.log`,
// `ui.toast`) is a host operation, not a plugin-chain event, so nothing
// beneath the plugins answers it by default — a test supplies the bottom
// itself with `on(<name>, ...)` returning `{ value }`.
import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

const SESSION_INPUT = { cwd: "/repo", surface: null, isInteractive: false } as const;

/** What `$.process.run` resolves with, in full: the engine's shape has the
 * two truncation flags, and a stub missing them does not typecheck. */
function ran(exitCode: number, stdout: string, stderr = "") {
  return {
    value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
  };
}

/** What qsm-setup prints under --json: one outcome envelope, data inside. */
function envelope(data: unknown): string {
  return `${JSON.stringify({ code: "ok", exit: 0, reason: "the verb did what was asked", message: "", warnings: [], data })}\n`;
}

/** The bottom of the chain and the two UI operations, once: the session
 * start beneath the plugins, a silent log, and a toast collector. */
function stubHost(on: On): { bottomRan: () => number; toasts: string[] } {
  let bottomRan = 0;
  const toasts: string[] = [];
  on("session.start", (_$, e) => {
    bottomRan += 1;
    return { cwd: e.cwd };
  });
  const silent = { value: undefined };
  on("ui.log", () => silent);
  on("ui.toast", (_$, e) => {
    toasts.push(e.text);
    return silent;
  });
  return { bottomRan: () => bottomRan, toasts };
}

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>;
type Run = Parameters<Body>;

/** One session start against a stubbed host; `reply` is what process.run
 * answers, none leaves it unstubbed. */
async function start($: Run[0], on: Run[1], reply?: ReturnType<typeof ran>) {
  const host = stubHost(on);
  if (reply !== undefined) {
    on("process.run", () => reply);
  }
  await $.session.start(SESSION_INPUT);
  return host;
}

test("session.start toasts and still reaches the bottom when process.run has no stub", async ($, on) => {
  // process.run is left unstubbed: the harness throws "no implementation
  // for process.run" into the hook, which reaches `.catch`.
  const { bottomRan, toasts } = await start($, on);
  expect(bottomRan()).toBe(1);
  expect(toasts).toHaveLength(1);
  expect(toasts[0]).toMatch(/^qsm-setup ERROR: session\.start:/);
});

test("session.start toasts the relink's own exit code and stderr when it fails", async ($, on) => {
  const { toasts } = await start($, on, ran(1, "", "boom"));
  expect(toasts[0]).toMatch(/^qsm-setup ERROR: session\.start: .*\(exit 1\): boom/);
});

test("session.start toasts once when the envelope's data.relinked is true", async ($, on) => {
  const { toasts } = await start($, on, ran(0, envelope({ relinked: true })));
  expect(toasts).toEqual(["qsm-setup: bin farm relinked"]);
});

test("session.start toasts nothing when the envelope's data.relinked is false", async ($, on) => {
  const { toasts } = await start(
    $,
    on,
    ran(0, envelope({ relinked: false, reason: "not opted in" })),
  );
  expect(toasts).toEqual([]);
});

test("session.start toasts an error when stdout is the bare shape the hook used to read", async ($, on) => {
  const { toasts } = await start($, on, ran(0, '{"relinked":true}'));
  expect(toasts.map((t) => t.replace(/:.*$/, ""))).toEqual(["qsm-setup ERROR"]);
});
