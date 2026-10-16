// `claude plugin test plugins/qsm-secrets` drives register.tsx against the engine itself: the guard
// and the prompt capture. blockedCommand and captureSecrets decide; the seam is proved here.
import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

/** A placeholder, built here so no literal one in this file reads as a captured id. */
const placeholder = (id: string): string => ["{{", "secret", ":", id, "}}"].join("");

const ALLOWED = JSON.stringify({ code: "ok", exit: 0, message: "", data: { denied: false } });
const REASON =
  "[qsm-secrets vault-reader] `rbw` can print a stored credential. Use `qsm-secrets pipe`";
const REFUSED = JSON.stringify({
  code: "blocked",
  exit: 5,
  message: REASON,
  data: { code: "vault-reader", command: "rbw get x", reason: REASON },
});

/** The guard verb's bottom: `process.run` answers `qsm-secrets guard` with `stdout`, and the
 * stdin it was given is kept. */
function guardAnswers(on: On, stdout: string): { stdin: string[]; argv: string[] } {
  const seen = { stdin: [] as string[], argv: [] as string[] };
  on("process.run", (_$, e) => {
    seen.argv = [...e.argv];
    seen.stdin.push(e.init?.stdin ?? "");
    return { value: { ...RAN, stdout } };
  });
  on("ui.log", () => ({ value: undefined }));
  on("ui.toast", () => ({ value: undefined }));
  return seen;
}

test("a command the guard verb refuses is denied with its reason, one it allows runs", async ($, on) => {
  on("tool.call", () => ({ result: "ran" }));
  const seen = guardAnswers(on, REFUSED);

  const denied = await $.tool.call({ tool: "Bash", command: "rbw get github-token" });

  expect(denied.deny).toBe(REASON);
  expect(seen.argv.slice(0, 2)).toEqual(["qsm-secrets", "guard"]);
  expect(seen.stdin).toEqual(["rbw get github-token"]);
});

test("a command the guard verb allows runs", async ($, on) => {
  on("tool.call", () => ({ result: "ran" }));
  guardAnswers(on, ALLOWED);

  const allowed = await $.tool.call({ tool: "Bash", command: "git status" });

  expect(allowed.result).toBe("ran");
});

test("a guard that cannot answer denies the call and says why", async ($, on) => {
  on("tool.call", () => ({ result: "ran" }));
  guardAnswers(on, "not an envelope");

  const denied = await $.tool.call({ tool: "Bash", command: "git status" });

  expect(denied.result).toBeUndefined();
  expect(denied.deny).toContain("the credential guard failed");
  expect(denied.deny).toContain("no outcome envelope");
});

test("a broken guard lets the doctor through and nothing else", async ($, on) => {
  on("tool.call", () => ({ result: "ran" }));
  guardAnswers(on, "not an envelope");

  expect((await $.tool.call({ tool: "Bash", command: "qsm-secrets doctor" })).result).toBe("ran");
  for (const command of [
    "bun plugins/qsm-secrets/scripts/install.ts --dry-run",
    "bun /tmp/x/plugins/qsm-secrets/scripts/install.ts",
    "qsm-secrets doctor; rbw get x",
    "qsm-secrets doctor | cat",
    "rbw get x",
  ]) {
    expect((await $.tool.call({ tool: "Bash", command })).deny).toContain(
      "the credential guard failed",
    );
  }
});

test("the guard sees a placeholder as written, before the substitution rewrites it", async ($, on) => {
  on("tool.call", () => ({ result: "ran" }));
  const seen = guardAnswers(on, ALLOWED);
  const command = `echo ${placeholder("cap_1")}`;

  await $.tool.call({ tool: "Bash", command });

  expect(seen.stdin).toEqual([command]);
});

/** Read's bottom: the host environment and the file system answer, so a path is judged as the engine sees it. */
function fileHost(on: On, real?: string): void {
  on("env.get", (_$, e) => {
    const { name } = e as { name: string };
    return { value: { HOME: "/home/p", XDG_RUNTIME_DIR: "/run/user/1" }[name] };
  });
  on("fs.stat", () =>
    real === undefined
      ? Promise.reject(new Error("ENOENT"))
      : { value: { kind: "file", size: 1, mtimeMs: 0, isLink: false, realPath: real } },
  );
  on("tool.call", () => ({ result: "ran" }));
  on("ui.log", () => ({ value: undefined }));
  on("ui.toast", () => ({ value: undefined }));
}

const PROTECTED_READS: [string, string | undefined][] = [
  ["/home/p/.local/share/keyrings/login.keyring", undefined],
  ["/home/p/.local/share/rbw/db", undefined],
  ["/run/user/1/qsm-secrets/s1/kubeconfig", undefined],
  ["/home/p/.password-store/work/token.gpg", undefined],
  ["/tmp/harmless-name", "/home/p/.local/share/keyrings/login.keyring"],
];
for (const [path, real] of PROTECTED_READS) {
  test(`a Read of ${path} is denied`, async ($, on) => {
    fileHost(on, real);

    const denied = await $.tool.call({ tool: "Read", file_path: path });

    expect(denied.result).toBeUndefined();
    expect(denied.deny).toContain("keyring-files");
    expect(denied.deny).toContain("qsm-secrets pipe");
  });
}

test("a Grep with no path is judged by the working directory", async ($, on) => {
  fileHost(on);
  let cwd = "/home/p";
  on("session.cwd", () => ({ value: cwd }));

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the engine's declared tool names list no Grep
  const denied = await $.tool.call({ tool: "Grep", pattern: "x" } as never);
  expect(denied.deny).toContain("keyring-files");

  cwd = "/home/p/project";
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the engine's declared tool names list no Grep
  const ran = await $.tool.call({ tool: "Grep", pattern: "x" } as never);
  expect(ran.result).toBe("ran");
});

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the engine's declared tool names list no Glob
const glob = (input: { pattern: string; path?: string }) => ({ tool: "Glob", ...input }) as never;

test("a Glob under the pass store, or with a pattern that starts there, is denied", async ($, on) => {
  fileHost(on);
  on("session.cwd", () => ({ value: "/home/p/project" }));

  const byPath = await $.tool.call(glob({ pattern: "**/*.gpg", path: "/home/p/.password-store" }));
  expect(byPath.deny).toContain("keyring-files");
  const byPattern = await $.tool.call(glob({ pattern: "/home/p/.password-store/**" }));
  expect(byPattern.deny).toContain("keyring-files");
  const ordinary = await $.tool.call(glob({ pattern: "src/**/*.ts" }));
  expect(ordinary.result).toBe("ran");
  const relative = await $.tool.call(
    glob({ pattern: "../.password-store/**", path: "/home/p/project" }),
  );
  expect(relative.deny).toContain("keyring-files");
});

test("a Glob from the home directory lists names and is not denied", async ($, on) => {
  fileHost(on);
  on("session.cwd", () => ({ value: "/home/p" }));

  const listed = await $.tool.call(glob({ pattern: "*.md" }));
  expect(listed.result).toBe("ran");
});

test("a Read of an ordinary file runs", async ($, on) => {
  fileHost(on, "/home/p/project/README.md");

  const read = await $.tool.call({ tool: "Read", file_path: "/home/p/project/README.md" });

  expect(read.result).toBe("ran");
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
  const data = {
    text: "key {{secret:cap_1}}…abcd",
    captured: [{ id: "cap_1", suffix: "abcd" }],
    taken: [],
  };
  const toast = host(on, JSON.stringify({ code: "ok", exit: 0, message: "", data }));

  const sent = await $.prompt.submit(PASTE);

  expect(sent.text).toBe("key {{secret:cap_1}}…abcd");
  expect(toast()).toBe("qsm-secrets: captured 1 secret(s) as cap_1");
});

test("a failed capture drops the prompt, naming the cause and the fix, and toasts it loudly", async ($, on) => {
  const failure = { code: "missing", exit: 4, message: "no backend chosen", data: null };
  const toast = host(on, JSON.stringify(failure));

  const sent = (await $.prompt.submit(PASTE)) as { text?: string; drop?: string };

  expect(sent.text).toBeUndefined();
  expect(sent.drop).toContain("capture failed");
  expect(sent.drop).toContain("qsm-secrets doctor");
  expect(sent.drop).not.toContain("ghp_x");
  expect(toast()).toBe("qsm-secrets ERROR: prompt.submit: capture failed, the prompt was not sent");
});

test("a name that was already stored is said in the toast", async ($, on) => {
  const data = {
    text: "k=cap_1",
    captured: [{ id: "cap_1", suffix: "abcd" }],
    taken: ["k"],
  };
  const toast = host(on, JSON.stringify({ code: "ok", exit: 0, message: "", data }));

  await $.prompt.submit(PASTE);

  expect(toast()).toContain("k is already stored");
});

const ENV_CHAIN = "qsm-secrets env cap_1=QSM_SECRET_CAP_1 --folder capture -- sh -c ";

test("a command holding an id runs wrapped in qsm-secrets env, the id never in its text", async ($, on) => {
  let ran = "";
  on("tool.call", { tool: "Bash" }, (_$, e) => {
    ran = e.command;
    return { result: { stdout: "", stderr: "", interrupted: false } };
  });
  guardAnswers(on, ALLOWED);

  await $.tool.call({ tool: "Bash", command: "echo {{secret:cap_1}}…abcd it's" });

  expect(ran).toBe(`${ENV_CHAIN}'echo "$QSM_SECRET_CAP_1" it'\\''s'`);
});

test("a named key's placeholder runs env with its own namespace and key", async ($, on) => {
  let ran = "";
  on("tool.call", { tool: "Bash" }, (_$, e) => {
    ran = e.command;
    return { result: { stdout: "", stderr: "", interrupted: false } };
  });
  guardAnswers(on, ALLOWED);

  await $.tool.call({ tool: "Bash", command: `echo ${placeholder("qsm/deploy-key")}…abcd` });

  expect(ran).toBe(
    `qsm-secrets env deploy-key=QSM_SECRET_QSM_DEPLOY_KEY --folder qsm -- sh -c 'echo "$QSM_SECRET_QSM_DEPLOY_KEY"'`,
  );
});

test("two ids that map to one variable are refused, not run with the second value in both", async ($, on) => {
  on("tool.call", () => ({ result: "ran" }));
  guardAnswers(on, ALLOWED);
  const id = (key: string): string => placeholder(`qsm/${key}`);

  const denied = await $.tool.call({ tool: "Bash", command: `echo ${id("a-b")} ${id("a_b")}` });

  expect(denied.result).toBeUndefined();
  expect(denied.deny).toContain("would share QSM_SECRET_QSM_A_B");
});

test("every row is masked through one qsm-secrets mask --all, and withheld when masking fails", async ($, on) => {
  const answer = (rows: string[]) => ({
    ...RAN,
    stdout: JSON.stringify({ code: "ok", exit: 0, message: "", data: { texts: rows } }),
  });
  let toast = "";
  on("ui.toast", (_$, e) => {
    toast = e.text;
    return { value: undefined };
  });
  on("ui.log", () => ({ value: undefined }));
  let broken = false as boolean;
  let argv: string[] = [];
  let stdin = "";
  on("process.run", (_$, e) => {
    argv = [...e.argv];
    stdin = e.init?.stdin ?? "";
    return {
      value: broken
        ? { ...RAN, stdout: "not an envelope" }
        : answer(["tok={{secret:cap_1}}", "ok"]),
    };
  });
  const row = {
    door: "tool-result" as const,
    origin: { kind: "tool" as const, tool: "Read" },
    uuid: "u1",
    message: {
      type: "user" as const,
      content: [
        { type: "text", text: "tok=VALUE" },
        { type: "text", text: "ok" },
      ],
    },
  };

  const stored = await $.session.append(row);
  expect(argv.slice(0, 3)).toEqual(["qsm-secrets", "mask", "--all"]);
  expect(JSON.parse(stdin)).toEqual(["tok=VALUE", "ok"]);
  expect(stored.message?.content).toEqual([
    { type: "text", text: "tok={{secret:cap_1}}" },
    { type: "text", text: "ok" },
  ]);

  broken = true;
  const failed = await $.session.append(row);
  const texts = (failed.message?.content ?? []).map((b) => String(b.text));
  expect(texts.join("\n")).not.toContain("VALUE");
  expect(texts[0]).toContain("withheld");
  expect(toast).toContain("session.append");
});

test("a tool result of any tool is masked in its nested text, and a media block is kept as it is", async ($, on) => {
  let sent: string[] = [];
  on("process.run", (_$, e) => {
    const stdin: unknown = JSON.parse(e.init?.stdin ?? "[]");
    sent = Array.isArray(stdin)
      ? stdin.filter((text): text is string => typeof text === "string")
      : [];
    const texts = sent.map((text) => text.replaceAll("VALUE", "{{secret:cap_1}}"));
    return {
      value: {
        ...RAN,
        stdout: JSON.stringify({ code: "ok", exit: 0, message: "", data: { texts } }),
      },
    };
  });
  const image = {
    type: "image",
    source: { type: "base64", media_type: "image/png", data: "VALUE" },
  };
  for (const tool of ["Read", "Grep", "mcp__plugin_qsm-memory_qsm-memory__notes", "Agent"]) {
    const stored = await $.session.append({
      door: "tool-result" as const,
      origin: { kind: "tool" as const, tool },
      uuid: `u-${tool}`,
      message: {
        type: "user" as const,
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: [{ type: "text", text: `${tool} says VALUE` }, image],
          },
        ],
      },
    });
    const [block] = stored.message?.content ?? [];
    expect(block?.content).toEqual([
      { type: "text", text: `${tool} says {{secret:cap_1}}` },
      image,
    ]);
    expect(sent).toEqual([`${tool} says VALUE`]);
  }
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
    const [, verb = ""] = e.argv;
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

  await $.session.end({ sessionId: "s1", reason: "other", resume: { id: "s1" } });

  expect(seen.verbs).toEqual(["scrub", "clean"]);
  expect(seen.logs.join("\n")).toContain("XDG_RUNTIME_DIR is not set");
});

test("a scrub that fails still lets the clean run, and the failure is logged", async ($, on) => {
  const NoTranscript = JSON.stringify({
    code: "missing",
    exit: 4,
    message: "no transcript for s1",
    data: null,
  });
  const seen = ending(on, (verb) => (verb === "scrub" ? NoTranscript : OK));

  await $.session.end({ sessionId: "s1", reason: "other", resume: { id: "s1" } });

  expect(seen.verbs).toEqual(["scrub", "clean"]);
  expect(seen.logs.join("\n")).toContain("no transcript for s1");
});
