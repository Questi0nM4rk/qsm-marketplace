// `claude plugin test plugins/qsm-ccr` drives register.tsx against the engine: which verb a
// session start reaches, with which argv, and what a failure shows. What sync does is proved by
// bun test in scripts/cli.test.ts. `process.run`, `ui.log` and `ui.toast` are host operations, so
// the test supplies them with `on(<name>, ...)` returning `{ value }`.
import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";
import { printed, recordingHost } from "./host.generated.ts";

const START = { cwd: "/work", surface: null, isInteractive: false } as const;
const SYNC = "qsm-ccr sync --if-stale --detach --json";

/** The host under register.tsx: the chain bottom, and a qsm-ccr that answers `code`. */
function host(on: On, code = "ok", exit = 0, message = "") {
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  return recordingHost(on, () => printed(code, exit, message));
}

test("a session start runs the stale-only detached sync once", async ($, on) => {
  const seen = host(on);
  await $.session.start(START);
  expect(seen.runs).toEqual([SYNC]);
  expect(seen.toasts).toEqual([]);
});

test("a failed sync call is a toast and a log, and the session goes on", async ($, on) => {
  const seen = host(on, "missing", 4, "qsm-ccr is not on PATH");
  const r = await $.session.start(START);
  expect(r.cwd).toBe("/work");
  expect(seen.toasts).toHaveLength(1);
  expect(seen.toasts[0]).toMatch(/^qsm-ccr ERROR: session\.start: .*qsm-ccr is not on PATH/);
  expect(seen.logs.some((l) => l.startsWith("session.start failed ("))).toBe(true);
});
