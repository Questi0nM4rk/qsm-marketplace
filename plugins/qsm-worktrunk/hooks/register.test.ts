// `claude plugin test plugins/qsm-worktrunk` drives register.tsx's hooks
// against the engine itself, so the wiring is proved rather than assumed:
// which event reaches which library call, and what each handler answers with.
// The library modules' own behaviour is proved by `bun test` in lib/*.test.ts;
// nothing here re-tests it. The three jobs that stay classic command hooks
// (the waiting marker, worktree create, worktree remove: no function event
// exists for them) are proved by plugins/qsm-worktrunk/scripts/hooks.test.ts,
// which spawns each on stdin the way the harness does.
//
// `$`'s callable methods are the ten namespaces of EventCalls (tool, command,
// config, prompt, skill, attribution, agent, session, turn, ui).
//
// Everything else the module calls (`process.run`, `ui.log`,
// `command.register`) is a host operation rather than a plugin-chain event,
// so nothing beneath answers it by default: each test supplies the bottom
// itself with `on(<name>, ...)` returning `{ value }`.
import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

const SESSION_INPUT = { cwd: "/repo", surface: null, isInteractive: false } as const;

/** The operations every handler here reaches for, with `wt` answering well.
 * `onRun` and `onRegister` record what the module asked for; each operation is
 * registered once per test, because a second registration of one name fails
 * the module's load. */
function stubOperations(
  on: On,
  recorders: {
    onRun?: (argv: readonly string[]) => void;
    onRegister?: (name: string) => void;
  } = {},
) {
  on("ui.log", () => ({ value: undefined }));
  on("session.cwd", () => ({ value: "/repo" }));
  on("env.get", () => ({ value: "/home/p" }));
  on("command.register", (_$, e) => {
    recorders.onRegister?.(e.name);
    return { value: { command: e.name } };
  });
  on("process.run", (_$, e) => {
    recorders.onRun?.(e.argv);
    const argv = e.argv.join(" ");
    const help = "Options:\n  -c, --create\n  -b, --base <BASE>\n";
    if (argv.includes("switch --help")) {
      return done(help);
    }
    if (argv.includes("--version")) {
      return done("wt v0.68.0\n");
    }
    if (e.argv[0] === "sh") {
      return done("/usr/bin/wt\n");
    }
    return done("");
  });
}

function done(stdout: string) {
  return {
    value: { exitCode: 0, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
  };
}

function bashCall(command: string) {
  return { tool: "Bash", command } as const;
}

/** A tool.call bottom that counts what reached it. */
function stubToolCall(on: On) {
  let bottomRan = 0;
  on("tool.call", () => {
    bottomRan += 1;
    return { result: "ran" };
  });
  return () => bottomRan;
}

/** A prompt.submit bottom that counts what reached it and passes the text on. */
function stubPromptSubmit(on: On) {
  let bottomRan = 0;
  on("prompt.submit", (_$, e) => {
    bottomRan += 1;
    return { text: e.text };
  });
  return () => bottomRan;
}

/** A prompt.submit bottom that keeps the context the turn reached it with, in a session at `cwd`. */
function captureContext(on: On, cwd: string) {
  let seen: readonly string[] = [];
  on("prompt.submit", (_$, e) => {
    seen = e.context ?? [];
    return { text: e.text };
  });
  on("session.cwd", () => ({ value: cwd }));
  on("env.get", () => ({ value: "/home/p" }));
  return () => seen.join("\n");
}

/** A ui.toast bottom that keeps what it was told. */
function stubToasts(on: On) {
  const toasts: string[] = [];
  on("ui.toast", (_$, e) => {
    toasts.push(e.text);
    return { value: undefined };
  });
  return toasts;
}

/** The command call the doctor answers. */
function doctorCommand() {
  return {
    command: "qsm-worktrunk",
    args: "",
    origin: { kind: "composer" as const },
    presentation: { isFullscreen: false, columns: 80 },
  };
}

test("a raw git worktree call is denied, and the wt command named", async ($, on) => {
  const bottomRan = stubToolCall(on);
  on("ui.log", () => ({ value: undefined }));

  const result = await $.tool.call(bashCall("git worktree list"));

  expect(bottomRan()).toBe(0);
  expect(result.deny).toContain("wt list");
});

test("a git call that is not git worktree reaches the tool untouched", async ($, on) => {
  const bottomRan = stubToolCall(on);

  const result = await $.tool.call(bashCall("git status"));

  expect(bottomRan()).toBe(1);
  expect(result.deny).toBeUndefined();
});

test("a prompt submitted inside a workspace carries its name, path and branch", async ($, on) => {
  const seen = captureContext(on, "/home/p/repo.feature");
  on("process.run", (_$, e) => {
    const git = e.argv.slice(1).join(" ");
    const answers: Record<string, string> = {
      "rev-parse --is-inside-work-tree": "true\n",
      "rev-parse --path-format=absolute --git-dir --git-common-dir":
        "/home/p/repo/.git/worktrees/feature\n/home/p/repo/.git\n",
      "rev-parse --show-toplevel": "/home/p/repo.feature\n",
      "symbolic-ref --short HEAD": "feature\n",
    };
    return done(answers[git] ?? "");
  });

  await $.prompt.submit({ text: "hello", wait: false, origin: { kind: "composer" } });

  expect(seen()).toContain("branch: feature");
  expect(seen()).toContain("path: ~/repo.feature");
});

test("a prompt submitted in the main checkout tells the agent to move into its own worktree", async ($, on) => {
  const seen = captureContext(on, "/home/p/repo");
  on("process.run", (_$, e) => {
    const inside = e.argv.includes("--is-inside-work-tree");
    return done(inside ? "true\n" : "/home/p/repo/.git\n/home/p/repo/.git\n");
  });

  await $.prompt.submit({ text: "hello", wait: false, origin: { kind: "composer" } });

  expect(seen()).toContain("move into this session's own worktree with EnterWorktree");
});

test("A new turn starts", async ($, on) => {
  const argvs: string[] = [];
  const bottomRan = stubPromptSubmit(on);
  stubOperations(on, { onRun: (argv) => argvs.push(argv.join(" ")) });

  await $.prompt.submit({ text: "hello", wait: false, origin: { kind: "composer" } });

  expect(bottomRan()).toBe(1);
  expect(argvs.some((argv) => argv.startsWith("wt config state marker set "))).toBe(true);
});

test("The session ends", async ($, on) => {
  const argvs: string[] = [];
  on("session.end", (_$, e) => ({ sessionId: e.sessionId }));
  stubOperations(on, { onRun: (argv) => argvs.push(argv.join(" ")) });

  await $.session.end({ reason: "other", sessionId: "sess-1", resume: { id: "sess-1" } });

  expect(argvs).toContain("wt config state marker clear");
});

test("session.start declares /qsm-worktrunk, which is what makes the doctor reachable", async ($, on) => {
  const registered: string[] = [];
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  stubOperations(on, { onRegister: (name) => registered.push(name) });

  await $.session.start(SESSION_INPUT);

  expect(registered).toContain("qsm-worktrunk");
});

test("the declared command answers with the doctor's report", async ($, on) => {
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  stubOperations(on);

  await $.session.start(SESSION_INPUT);
  const result = await $.command.run(doctorCommand());

  expect(result.text).toContain("healthy");
  expect(result.text).toContain("v0.68.0");
});

test("a wt that cannot create workspaces is reported unhealthy, not healthy", async ($, on) => {
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("ui.log", () => ({ value: undefined }));
  on("command.register", (_$, e) => ({ value: { command: e.name } }));
  on("process.run", (_$, e) => {
    const argv = e.argv.join(" ");
    if (argv.includes("switch --help")) {
      return done("Options:\n  --create\n");
    }
    if (argv.includes("--version")) {
      return done("wt 0.22.0\n");
    }
    return done("/home/someone/.cargo/bin/wt\n");
  });

  const result = await $.command.run(doctorCommand());

  expect(result.text).toContain("cannot create a workspace");
  expect(result.text).toContain("0.22.0");
});

test("a prompt submitted toasts and still lets the prompt through when process.run has no stub", async ($, on) => {
  const bottomRan = stubPromptSubmit(on);
  const toasts = stubToasts(on);
  on("ui.log", () => ({ value: undefined }));
  // process.run is left unstubbed: the harness throws "no implementation
  // for process.run" into the hook, which reaches `.catch`.

  const result = await $.prompt.submit({
    text: "hello",
    wait: false,
    origin: { kind: "composer" },
  });

  expect(bottomRan()).toBe(1);
  expect(result.text).toBe("hello");
  expect(toasts.length).toBe(1);
  expect(toasts[0]).toMatch(/^qsm-worktrunk ERROR: prompt\.submit:/);
});
