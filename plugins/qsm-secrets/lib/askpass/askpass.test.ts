// The askpass path against a fake `qs`: request parse, provider mapping, the reply socket's
// lifecycle, and the link a consumer's env variable points at, run as a compiled binary.

import { beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { sleep, spawn } from "bun";
import { fakeBin } from "../../../../lib/fixtures/bin.ts";
import { isolatedEnv } from "../../../../lib/fixtures/cli.ts";
import { sandboxDir } from "../../../../lib/fixtures/sandbox.ts";
import { ask } from "./ask.ts";
import { fakeQs } from "./fake-qs.ts";
import { providerOf } from "./index.ts";
import { argvFor, envLines, linkedKinds } from "./link.ts";
import { openReplySocket, parseReply } from "./socket.ts";
import type { Input } from "./types.ts";

const QML = resolve(import.meta.dir, "../../qml/askpass");
const CLI = resolve(import.meta.dir, "../../scripts/cli.ts");
const TYPED = "typed-pane-value-1";

let root = "";
let bin = "";
let runtime = "";
let log = "";

beforeEach(() => {
  root = sandboxDir("qsm-askpass-");
  bin = join(root, "bin");
  runtime = join(root, "run");
  log = join(root, "qs.log");
  mkdirSync(bin);
  mkdirSync(runtime, { mode: 0o700 });
  fakeQs(bin);
});

const env = (extra: Record<string, string> = {}): Record<string, string> =>
  isolatedEnv(root, {
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    XDG_RUNTIME_DIR: runtime,
    QSM_ASKPASS_QML: QML,
    FAKE_QS_LOG: log,
    ...extra,
  });

/** The message the promise rejected with; the test fails when it resolved. */
async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the promise to reject");
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

describe("the reply line", () => {
  test("takes the nonce and a known action, and nothing else", () => {
    const line = (body: object): string => JSON.stringify(body);
    expect(parseReply(line({ nonce: "n", action: "allow", value: "v" }), "n")).toEqual({
      nonce: "n",
      action: "allow",
      value: "v",
    });
    expect(parseReply(line({ nonce: "x", action: "allow" }), "n")).toBeNull();
    expect(parseReply(line({ nonce: "n", action: "grant" }), "n")).toBeNull();
    expect(parseReply("not json", "n")).toBeNull();
    expect(parseReply(line({ nonce: "n", action: "cancel" }), "n")?.value).toBe("");
  });
});

describe("the reply socket", () => {
  test("lives in a 0700 directory as a 0600 socket and is gone after close", () => {
    const socket = openReplySocket(env());
    const dir = join(runtime, "qsm-askpass", socket.nonce);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(socket.path).mode & 0o777).toBe(0o600);
    expect(socket.path.startsWith(dir)).toBe(true);
    socket.close();
    expect(existsSync(dir)).toBe(false);
    expect(existsSync(join(runtime, "qsm-askpass"))).toBe(false);
    socket.close();
  });

  test("a wrong nonce is ignored and the right one answers", async () => {
    const socket = openReplySocket(env());
    const waiting = socket.wait(5000);
    const send = async (body: object): Promise<void> => {
      const { connect } = await import("node:net");
      await new Promise<void>((done) => {
        const client = connect(socket.path, () => {
          client.end(`${JSON.stringify(body)}\n`);
        });
        client.on("close", () => {
          done();
        });
      });
    };
    await send({ nonce: "wrong", action: "allow", value: "x" });
    await send({ nonce: socket.nonce, action: "deny", value: "" });
    expect((await waiting)?.action).toBe("deny");
    socket.close();
  });

  test("times out with null", async () => {
    const socket = openReplySocket(env());
    expect(await socket.wait(50)).toBeNull();
    socket.close();
  });

  test("without a runtime directory it is missing", () => {
    expect(() => openReplySocket({})).toThrow("XDG_RUNTIME_DIR");
  });
});

describe("providers", () => {
  const input = (argv: string[], stdin = "", asked: Record<string, string> = {}): Input => ({
    argv,
    env: asked,
    namespace: "qsm",
    stdin: () => stdin,
  });
  const reply = (action: "allow" | "deny" | "cancel", value = "") => ({
    nonce: "n",
    action,
    value,
  });

  test("sudo masks, ssh and git mask only what asks for a secret", () => {
    expect(providerOf("sudo").request(input(["[sudo] password for me: "])).masked).toBe(true);
    expect(providerOf("ssh").request(input(["Enter passphrase for key: "])).masked).toBe(true);
    expect(providerOf("ssh").request(input(["Are you sure (yes/no)? "])).masked).toBe(false);
    expect(providerOf("git").request(input(["Username for 'https://x': "])).masked).toBe(false);
    expect(providerOf("git").request(input(["Password for 'https://x': "])).masked).toBe(true);
  });

  test("an answer goes out as the message; deny and cancel are failures with a reason", () => {
    const sudo = providerOf("sudo");
    expect(sudo.finish(input(["p"]), reply("allow", "pw"))).toMatchObject({
      code: "ok",
      message: "pw",
    });
    expect(sudo.finish(input(["p"]), reply("deny"))).toMatchObject({
      code: "failed",
      message: "denied by the person",
    });
    expect(sudo.finish(input(["p"]), reply("cancel"))).toMatchObject({
      code: "failed",
      message: "cancelled by the person",
    });
    expect(sudo.finish(input(["p"]), reply("allow", ""))).toMatchObject({ code: "failed" });
  });

  test("decide answers an ask request with an ask response of the same id", () => {
    const decide = providerOf("decide");
    const request = JSON.stringify({
      id: "a1",
      toolName: "Bash",
      toolInput: { command: "ls" },
      reason: "r",
    });
    expect(decide.request(input([], request))).toMatchObject({ kind: "decide", prompt: "r" });
    const allowed: unknown = JSON.parse(
      decide.finish(input([], request), reply("allow")).message ?? "",
    );
    expect(allowed).toMatchObject({ id: "a1", decision: "allow" });
    const cancelled: unknown = JSON.parse(
      decide.finish(input([], request), reply("cancel")).message ?? "",
    );
    expect(cancelled).toMatchObject({
      id: "a1",
      decision: "deny",
      reason: "cancelled by the person",
    });
    expect(() => decide.request(input([], "nope"))).toThrow("not an ask request");
  });

  test("decide shows the whole input, however long", () => {
    const command = `echo ${"x".repeat(900)} END`;
    const request = JSON.stringify({
      id: "a2",
      toolName: "Bash",
      toolInput: { command },
      reply: "",
    });
    const shown = providerOf("decide").request(input([], request));
    expect(shown.subject).toContain(command);
  });

  test("an unknown kind is a usage error that names the kinds", () => {
    expect(() => providerOf("toString")).toThrow("unknown askpass kind");
  });
});

describe("the link", () => {
  test("a run as qsm-askpass-<kind> reads as askpass <kind> -- <the consumer's words>", () => {
    expect(argvFor("/home/u/.local/bin/qsm-askpass-sudo", ["[sudo] password: "])).toEqual([
      "askpass",
      "sudo",
      "--",
      "[sudo] password: ",
    ]);
    expect(argvFor("qsm-secrets", ["list"])).toEqual(["list"]);
    expect(argvFor("qsm-askpass-secret", ["x"])).toEqual(["x"]);
  });

  test("enable names a variable per linked kind", () => {
    expect(linkedKinds()).toEqual(["sudo", "ssh", "git", "decide"]);
    expect(envLines(["sudo", "ssh"], "/b")).toEqual([
      "set -gx SUDO_ASKPASS /b/qsm-askpass-sudo",
      "set -gx SSH_ASKPASS /b/qsm-askpass-ssh",
      "set -gx SSH_ASKPASS_REQUIRE prefer",
    ]);
  });
});

describe("ask", () => {
  const options = (extra: object = {}) => ({
    env: env({ FAKE_ACTION: "allow", FAKE_VALUE: TYPED }),
    namespace: "qsm",
    callerPid: process.pid,
    ...extra,
  });

  test("a request names the caller and holds no value", async () => {
    rmSync(log, { force: true });
    const outcome = await ask("sudo", ["[sudo] password: "], options());
    expect(outcome).toMatchObject({ code: "ok", message: TYPED });
    const logged = readFileSync(log, "utf8");
    expect(logged).not.toContain(TYPED);
    const show = strings(JSON.parse(logged.split("\n")[1] ?? "[]")).at(-1) ?? "";
    expect(JSON.parse(show)).toMatchObject({ kind: "sudo", requestedBy: { pid: process.pid } });
    expect(logged).toContain(`"-p","${QML}"`);
    expect(existsSync(join(runtime, "qsm-askpass"))).toBe(false);
  });

  test("no answer in time is a failure that says so, and the socket is removed", async () => {
    const outcome = await ask(
      "sudo",
      ["p"],
      options({ env: env({ FAKE_ACTION: "none" }), timeoutMs: 100 }),
    );
    expect(outcome).toMatchObject({ code: "failed", message: "timed out waiting for the person" });
    expect(existsSync(join(runtime, "qsm-askpass"))).toBe(false);
  });

  test("a pane that cannot be reached is missing", async () => {
    const empty = join(root, "nothing");
    mkdirSync(empty, { recursive: true });
    expect(await rejection(ask("sudo", ["p"], options({ env: env({ PATH: empty }) })))).toContain(
      "quickshell (qs) is not on PATH",
    );
    expect(
      await rejection(ask("sudo", ["p"], options({ env: env({ QSM_ASKPASS_QML: empty }) }))),
    ).toContain("not installed");
    expect(readdirSync(runtime)).toEqual([]);
  });
});

describe("ssh prompt modes", () => {
  const input = (asked: Record<string, string>): Input => ({
    argv: ["Are you sure?"],
    env: asked,
    namespace: "qsm",
    stdin: () => "",
  });
  const reply = (action: "allow" | "deny" | "cancel") => ({ nonce: "n", action, value: "" });

  test("confirm is a yes or no with no text, and none is a notice", () => {
    const ssh = providerOf("ssh");
    const confirm = input({ SSH_ASKPASS_PROMPT: "confirm" });
    expect(ssh.request(confirm)).toMatchObject({ kind: "decide", masked: false });
    expect(ssh.finish(confirm, reply("allow"))).toMatchObject({ code: "ok", message: "" });
    expect(ssh.finish(confirm, reply("deny"))).toMatchObject({ code: "failed" });
    const none = input({ SSH_ASKPASS_PROMPT: "none" });
    expect(ssh.request(none)).toMatchObject({ kind: "notice" });
    expect(ssh.finish(none, reply("cancel"))).toMatchObject({ code: "ok" });
  });
});

describe("a signal", () => {
  test("SIGTERM withdraws the request and removes the socket directory", async () => {
    rmSync(log, { force: true });
    const child = spawn(["bun", CLI, "askpass", "sudo", "--", "p"], {
      env: env({ FAKE_ACTION: "none" }),
      stdout: "pipe",
      stderr: "pipe",
    });
    const dir = join(runtime, "qsm-askpass");
    for (let tries = 0; tries < 100 && !existsSync(dir); tries += 1) {
      await sleep(50);
    }
    expect(existsSync(dir)).toBe(true);
    child.kill("SIGTERM");
    expect(await child.exited).toBe(143);
    expect(existsSync(dir)).toBe(false);
    expect(readFileSync(log, "utf8")).toContain('"withdraw"');
  });
});

describe("a consumer that runs $SUDO_ASKPASS", () => {
  test("through the compiled binary's link it gets the typed text on stdout and exit 0", () => {
    const out = join(root, "compiled");
    mkdirSync(out);
    const built = spawnSync(
      "bun",
      ["build", "--compile", "--target", "bun", "--outfile", join(out, "qsm-secrets"), CLI],
      {
        encoding: "utf8",
      },
    );
    expect(built.status).toBe(0);
    symlinkSync("qsm-secrets", join(out, "qsm-askpass-sudo"));
    const fakeSudo = fakeBin(root, "fake-sudo", 'exec "$SUDO_ASKPASS" "[sudo] password for me: "');
    const run = (extra: Record<string, string>) =>
      spawnSync(fakeSudo, [], {
        encoding: "utf8",
        env: env({ ...extra, SUDO_ASKPASS: join(out, "qsm-askpass-sudo") }),
      });
    const allowed = run({ FAKE_ACTION: "allow", FAKE_VALUE: TYPED });
    expect(allowed.status).toBe(0);
    expect(allowed.stdout).toBe(`${TYPED}\n`);
    const denied = run({ FAKE_ACTION: "deny" });
    expect(denied.status).toBe(1);
    expect(denied.stdout).toBe("");
    expect(denied.stderr).toContain("denied by the person");
  });
});
