// `claude plugin test plugins/qsm-secrets` drives register.tsx against the engine itself: the guard
// and the prompt capture. blockedCommand and captureSecrets decide; the seam is proved here.
import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

test("a raw vault reader is denied, an ordinary command runs", async ($, on) => {
  on("tool.call", () => ({ result: "ran" }));
  on("ui.log", () => ({ value: undefined }));

  const denied = await $.tool.call({ tool: "Bash", command: "rbw get github-token" });
  const allowed = await $.tool.call({ tool: "Bash", command: "git status" });

  expect(denied.deny).toContain("qsm-secrets pipe");
  expect(allowed.result).toBe("ran");
});

const RAN = { exitCode: 0, stderr: "", isStdoutTruncated: false, isStderrTruncated: false };
const PASTE = { text: "key ghp_x", wait: false, origin: { kind: "composer" } } as const;

/** The prompt chain's bottom, `qsm-secrets capture` answering `stdout`; returns the last toast. */
function host(on: On, stdout: string): () => string {
  let toast = "";
  on("ui.toast", (_$, e) => {
    toast = e.text;
    return { value: undefined };
  });
  on("prompt.submit", (_$, e) => ({ text: e.text }));
  on("process.run", () => ({ value: { ...RAN, stdout } }));
  on("ui.log", () => ({ value: undefined }));
  return () => toast;
}

test("a captured prompt reaches the model as the replacement, with a toast naming the id", async ($, on) => {
  const data = { text: "key {{secret:cap_1}}…abcd", captured: [{ id: "cap_1", suffix: "abcd" }] };
  const toast = host(on, JSON.stringify({ code: "ok", exit: 0, message: "", data }));

  const sent = await $.prompt.submit(PASTE);

  expect(sent.text).toBe("key {{secret:cap_1}}…abcd");
  expect(toast()).toBe("qsm-secrets: captured 1 secret(s) as cap_1");
});

test("a failed capture lets the prompt in unchanged and toasts it loudly", async ($, on) => {
  const failure = { code: "missing", exit: 4, message: "no backend chosen", data: null };
  const toast = host(on, JSON.stringify(failure));

  const sent = await $.prompt.submit(PASTE);

  expect(sent.text).toBe("key ghp_x");
  expect(toast()).toBe(
    "qsm-secrets ERROR: prompt.submit: capture failed, the prompt went in unchanged",
  );
});

const ENV_CHAIN = "qsm-secrets env cap_1=QSM_SECRET_CAP_1 --folder capture -- sh -c ";

test("a command holding an id runs wrapped in qsm-secrets env, the id never in its text", async ($, on) => {
  let ran = "";
  on("tool.call", (_$, e) => {
    ran = (e as { command: string }).command;
    return { result: { stdout: "", stderr: "" } };
  });
  on("ui.log", () => ({ value: undefined }));

  await $.tool.call({ tool: "Bash", command: "echo {{secret:cap_1}}…abcd it's" });

  expect(ran).toBe(`${ENV_CHAIN}'echo "$QSM_SECRET_CAP_1" it'\\''s'`);
});

test("a result is masked through qsm-secrets mask, and withheld when masking fails", async ($, on) => {
  const stdout = (text: string) => ({
    ...RAN,
    stdout: JSON.stringify({ code: "ok", exit: 0, message: "", data: { text } }),
  });
  on("tool.call", () => ({ result: { stdout: "tok=VALUE", stderr: "" } }));
  on("ui.toast", () => ({ value: undefined }));
  on("ui.log", () => ({ value: undefined }));
  let broken = false as boolean;
  on("process.run", () => ({
    value: broken ? { ...RAN, stdout: "not an envelope" } : stdout("tok={{secret:cap_1}}"),
  }));

  const ok = await $.tool.call({ tool: "Bash", command: "echo {{secret:cap_1}}" });
  expect((ok.result as { stdout: string }).stdout).toBe("tok={{secret:cap_1}}");

  broken = true;
  const failed = await $.tool.call({ tool: "Bash", command: "echo {{secret:cap_1}}" });
  expect((failed.result as { stdout: string }).stdout).toContain("withheld");
  expect((failed.result as { stdout: string }).stdout).toContain("printed no outcome envelope");
});

/** Toasts are dropped and log lines kept in `logs`, so a test reads what the hook logged. */
function quietUi(on: On, logs: string[]): void {
  on("ui.toast", () => ({ value: undefined }));
  on("ui.log", (_$, e) => {
    logs.push(e.text);
    return { value: undefined };
  });
}

const NOTICE =
  "<task-notification><output-file>/tmp/tasks/12d301b5-a7e7-49ab-b0ca-564f748e878e.output</output-file></task-notification>";

test("a prompt that is not the person's own is never sent to capture, and the log names its origin", async ($, on) => {
  let spawned = 0;
  const logs: string[] = [];
  on("prompt.submit", (_$, e) => ({ text: e.text }));
  on("process.run", () => {
    spawned += 1;
    return { value: { ...RAN, stdout: "" } };
  });
  quietUi(on, logs);

  const sent = await $.prompt.submit({
    text: NOTICE,
    wait: false,
    origin: { kind: "task-notification" },
  });

  expect(sent.text).toBe(NOTICE);
  expect(spawned).toBe(0);
  expect(logs.join("\n")).toContain("task-notification");
});

test("a failed capture logs the verb, the exit code and the stderr, never the prompt", async ($, on) => {
  const logs: string[] = [];
  on("prompt.submit", (_$, e) => ({ text: e.text }));
  on("process.run", () => ({
    value: { ...RAN, exitCode: 1, stdout: "SECRET-PROMPT-TEXT", stderr: "EAGAIN: try again" },
  }));
  quietUi(on, logs);

  await $.prompt.submit(PASTE);

  const log = logs.join("\n");
  expect(log).toContain("qsm-secrets capture");
  expect(log).toContain("exit 1");
  expect(log).toContain("EAGAIN: try again");
  expect(log).not.toContain("SECRET-PROMPT-TEXT");
});

/** The session end's bottom: `process.run` answers every verb, the argv of each is kept in order. */
function ending(on: On, answer: (verb: string) => string): { verbs: string[]; logs: string[] } {
  const seen = { verbs: [] as string[], logs: [] as string[] };
  on("session.id", () => ({ value: "s1" }));
  on("session.end", (_$, e) => ({ sessionId: e.sessionId }));
  on("ui.toast", () => ({ value: undefined }));
  on("ui.log", (_$, e) => {
    seen.logs.push(e.text);
    return { value: undefined };
  });
  on("process.run", (_$, e) => {
    const [, verb = ""] = (e as { argv: string[] }).argv;
    seen.verbs.push(verb);
    return { value: { ...RAN, stdout: answer(verb) } };
  });
  return seen;
}

const OK = JSON.stringify({ code: "ok", exit: 0, message: "", data: {} });
const NO_RUNTIME = JSON.stringify({
  code: "missing",
  exit: 4,
  message: "XDG_RUNTIME_DIR is not set",
  data: null,
});

test("a session end starts the transcript scrub before it cleans, so a failed clean cannot stop it", async ($, on) => {
  const seen = ending(on, (verb) => (verb === "clean" ? NO_RUNTIME : OK));

  await $.session.end({ sessionId: "s1", reason: "other", resume: {} as never });

  expect(seen.verbs).toEqual(["scrub", "clean"]);
  expect(seen.logs.join("\n")).toContain("XDG_RUNTIME_DIR is not set");
});
