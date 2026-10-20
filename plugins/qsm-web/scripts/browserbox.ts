// qsm-web browserbox: the last rung.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { home } from "../../../lib/paths.ts";
import { join } from "node:path";
import {
  type Call,
  flagArg,
  type Handler,
  optionalNumber,
  optionalString,
  requiredNumber,
  requiredString,
} from "../../../lib/cli-base.ts";
import { fail, isRecord, type Outcome, ok, onPath } from "../../../lib/outcome.ts";
import { QsmError } from "../../../lib/qsm-error.ts";
import {
  buildDefinition,
  chooseRuntime,
  contextHash,
  execDefinition,
  imageSourceDefinition,
  type Instance,
  instanceName,
  listDefinition,
  liveViewUrl,
  outDir,
  parseInstances,
  pickPort,
  type Runtime,
  renderCommand,
  runDefinition,
  stopDefinition,
} from "../lib/browserbox.ts";
import { NO_ROOT, pluginRoot } from "../lib/doctor.ts";
import { readScript, type Script, ScriptError, secretSteps, withSecrets } from "../lib/steps.ts";
import { chooseVaultCli, readValue, VaultError } from "../lib/vault.ts";

const READY_TRIES = 120;
const READY_PAUSE_MS = 500;
const POLL_PAUSE_MS = 3000;
const DEFAULT_WAIT_MS = 300_000;

/** A synchronous pause, with no runtime-specific helper behind it. */
function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** One call's container runtime and the commands it ran or would run. */
class Box {
  readonly dryRun: boolean;
  readonly commands: string[] = [];
  private chosen: Runtime | null = null;

  constructor(dryRun: boolean) {
    this.dryRun = dryRun;
  }

  /** The runtime, chosen on first use, so a verb that needs no container
   * never fails on a machine that has none. */
  runtime(): Runtime {
    this.chosen ??= chooseRuntime(process.env, (cmd) => (this.dryRun ? true : onPath(cmd)));
    if (this.chosen === null) {
      throw new QsmError(
        "missing",
        "no container runtime reachable; install docker or podman, or set QSM_CONTAINER_RUNTIME",
      );
    }
    return this.chosen;
  }

  /** Run one runtime command. Under --dry-run it is collected, not run. */
  run(args: readonly string[], capture = true): { status: number; stdout: string } {
    if (this.dryRun) {
      this.commands.push(renderCommand(this.runtime(), args));
      return { status: 0, stdout: "" };
    }
    const { status, stdout } = spawnSync(this.runtime(), args, {
      encoding: "utf8",
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    return { status: status ?? 1, stdout: stdout ?? "" };
  }

  /** Send one job to an instance's driver over its standard input, so a
   * secret in the job never reaches an argument vector. */
  send(name: string, job: Record<string, unknown>, quiet = false): Record<string, unknown> {
    const args = execDefinition(name);
    if (this.dryRun) {
      this.commands.push(
        `${renderCommand(this.runtime(), args)} <<< ${JSON.stringify(redact(job))}`,
      );
      return { ok: true, dryRun: true };
    }
    const { status, stdout } = spawnSync(this.runtime(), args, {
      encoding: "utf8",
      input: `${JSON.stringify(job)}\n`,
      stdio: ["pipe", "pipe", quiet ? "ignore" : "inherit"],
    });
    const reply = (stdout ?? "").trim();
    if (status !== 0 && reply.length === 0) {
      return { ok: false, error: { kind: "driver", message: `the driver exited ${status ?? 1}` } };
    }
    let answer: unknown;
    try {
      answer = JSON.parse(reply);
    } catch {
      return { ok: false, error: { kind: "driver", message: "the driver answered with non-JSON" } };
    }
    return isRecord(answer)
      ? answer
      : {
          ok: false,
          error: { kind: "driver", message: "the driver answered with non-object JSON" },
        };
  }
}

/** A job as it may be printed: a filled value is replaced by its marker. */
function redact(job: Record<string, unknown>): Record<string, unknown> {
  const { steps } = job;
  if (!Array.isArray(steps)) {
    return job;
  }
  const shown = steps.map((s: unknown) =>
    isRecord(s) && s.redact === true ? { ...s, value: "[redacted]" } : s,
  );
  return { ...job, steps: shown };
}

function instances(box: Box): Instance[] {
  const { status, stdout } = box.run(listDefinition());
  if (status !== 0) {
    throw new QsmError("failed", `listing the running instances failed (exit ${status})`);
  }
  const lines = stdout.split("\n").map((line) => {
    const name = line.trim().split(/\s+/)[0] ?? "";
    const port = name.startsWith("bbox-") ? name.slice("bbox-".length) : "";
    return port.length > 0 ? `${name} ${port}` : "";
  });
  return parseInstances(lines.join("\n"));
}

/** Builds the image when there is none or its docker context changed since it was built. */
function ensureImage(box: Box): void {
  const root = pluginRoot(process.env);
  if (root === undefined) {
    throw new QsmError("missing", NO_ROOT);
  }
  const context = join(root, "docker");
  const source = contextHash(context);
  const image = box.run(imageSourceDefinition());
  if (image.status === 0 && image.stdout.trim() === source && !box.dryRun) {
    return;
  }
  const why = image.status === 0 ? "its docker context changed" : "there is none yet";
  process.stderr.write(`qsm-web browserbox: building the image from ${context}, ${why}\n`);
  const built = box.run(buildDefinition(context, source), false);
  if (built.status !== 0) {
    throw new QsmError("failed", `the image build failed (exit ${built.status})`);
  }
}

function ready(box: Box, name: string): boolean {
  for (let i = 0; i < READY_TRIES; i += 1) {
    if (box.dryRun) {
      return true;
    }
    if (box.send(name, { cmd: "ping" }, true).ok === true) {
      return true;
    }
    pause(READY_PAUSE_MS);
  }
  return false;
}

/** Start one instance. */
function startInstance(box: Box, out?: string): Instance & { readonly out: string } {
  ensureImage(box);
  const port = pickPort(instances(box).map((i) => i.port));
  if (port === null) {
    throw new QsmError("failed", "every live-view port in the block is taken");
  }
  const name = instanceName(port);
  const where = out ?? outDir(process.env, home(process.env), name);
  if (!box.dryRun) {
    mkdirSync(where, { recursive: true });
  }
  const liveView = liveViewUrl(port);
  const started = box.run(runDefinition({ name, port, outDir: where, liveView }));
  if (started.status !== 0) {
    throw new QsmError("failed", `the instance would not start (exit ${started.status})`);
  }
  if (!ready(box, name)) {
    const removed = box.run(stopDefinition(name));
    if (removed.status !== 0) {
      throw new QsmError(
        "failed",
        `${name} started but its browser never answered; its removal exited ${removed.status}; check for a possible leftover container`,
      );
    }
    throw new QsmError(
      "failed",
      `${name} started but its browser never answered; its container was removed`,
    );
  }
  return { name, port, liveView, out: where };
}

function start(call: Call, box: Box): Outcome {
  const instance = startInstance(box, optionalString(call, "out"));
  return ok(instance, JSON.stringify(instance));
}

function ls(_call: Call, box: Box): Outcome {
  const live = instances(box);
  return ok(live, JSON.stringify(live));
}

function stop(call: Call, box: Box): Outcome {
  const name = optionalString(call, "name");
  const all = flagArg(call, "all");
  if (all === (name !== undefined)) {
    return fail("usage", "stop takes exactly one of an instance name and --all");
  }
  if (name === undefined) {
    for (const i of instances(box)) {
      const { status } = box.run(stopDefinition(i.name));
      if (status !== 0) {
        throw new QsmError("failed", `${i.name} could not be stopped (exit ${status})`);
      }
    }
    return ok({ stopped: "all" }, "stopped every instance");
  }
  const { status } = box.run(stopDefinition(name));
  if (status !== 0) {
    throw new QsmError("failed", `${name} could not be stopped (exit ${status})`);
  }
  return ok({ stopped: name }, `stopped ${name}`);
}

/** One address, one result. */
function fetchOne(call: Call, box: Box): Outcome {
  const given = optionalString(call, "in");
  const keep = flagArg(call, "keep");
  const url = requiredString(call, "url");
  const name = given ?? startInstance(box).name;
  const job: Record<string, unknown> = {
    cmd: "fetch",
    url,
    html: flagArg(call, "html"),
    screenshot: flagArg(call, "screenshot"),
    cookies: flagArg(call, "cookies"),
    keep,
  };
  const settle = optionalNumber(call, "settle");
  if (settle !== undefined) {
    job.settle = settle;
  }
  const timeout = optionalNumber(call, "timeout");
  if (timeout !== undefined) {
    job.timeout = timeout;
  }
  const answer = box.send(name, job);
  const result: Record<string, unknown> = { ...answer, instance: name };
  if (given === undefined && !keep) {
    box.run(stopDefinition(name));
  }
  return answer.ok === true
    ? ok(result, JSON.stringify(result))
    : fail("failed", `${url} could not be fetched`, result);
}

/** Resolve every fill-secret step from the user's vault. The values exist
 * only in the job written to the driver's standard input. */
function fillSecrets(box: Box, script: Script): Script {
  const needed = secretSteps(script);
  if (needed.length === 0) {
    return script;
  }
  if (box.dryRun) {
    // A dry run never opens the vault: it shows the shape of the job, and
    // the value would be redacted in that output anyway.
    return withSecrets(script, new Map(needed.map(({ index }) => [index, "[dry-run]"])));
  }
  const cli = chooseVaultCli(process.env, onPath);
  if (cli === null) {
    throw new QsmError("missing", "a fill-secret step needs the rbw or bw client on PATH");
  }
  const values = new Map<number, string>();
  for (const { index, step } of needed) {
    const value = readValue(
      cli,
      (cmd, args) => {
        const r = spawnSync(cmd, args, { encoding: "utf8" });
        return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
      },
      step.item ?? "",
      step.field,
    );
    values.set(index, value);
  }
  return withSecrets(script, values);
}

function readJob(box: Box, file: string | undefined, steps: string | undefined): Script {
  const raw = file === undefined ? (steps ?? "") : readFileSync(file, "utf8");
  try {
    return fillSecrets(box, readScript(JSON.parse(raw)));
  } catch (err: unknown) {
    if (err instanceof ScriptError) {
      const where = err.index === null ? "" : `step ${err.index}: `;
      throw new QsmError("failed", `${where}${err.message}`, { cause: err });
    }
    if (err instanceof VaultError) {
      throw new QsmError("failed", err.message, { cause: err });
    }
    throw err;
  }
}

function runScript(call: Call, box: Box): Outcome {
  const file = optionalString(call, "file");
  const steps = optionalString(call, "steps");
  if ((file === undefined) === (steps === undefined)) {
    return fail("usage", "script takes exactly one of --file and --steps");
  }
  const job = readJob(box, file, steps);
  const result = box.send(requiredString(call, "name"), { cmd: "script", ...job });
  return result.ok === true
    ? ok(result, JSON.stringify(result))
    : fail("failed", "the script did not finish", result);
}

/** Polls the armed wait until the human cleared the wall (true), or it timed out or the caller's
 * timeout passed (false). */
function cleared(box: Box, name: string, tab: number, timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs + POLL_PAUSE_MS;
  while (Date.now() < deadline) {
    pause(POLL_PAUSE_MS);
    const status = box.send(name, { cmd: "wait_status", tab }, true);
    if (status.state === "cleared") {
      return true;
    }
    if (status.state === "timeout") {
      return false;
    }
  }
  return false;
}

/**
 * Hand one tab to a human: arm the wait, name the page to open, and poll until the wall is gone or
 * the caller's timeout passes.
 */
function takeover(call: Call, box: Box): Outcome {
  const name = requiredString(call, "name");
  const tab = requiredNumber(call, "tab");
  const timeoutMs = optionalNumber(call, "timeout") ?? DEFAULT_WAIT_MS;
  const view = liveViewUrl(Number(name.replace(/^bbox-/, "")));
  const armed = box.send(name, {
    cmd: "wait_for_human",
    tab,
    reason: optionalString(call, "reason") ?? "a wall the agent cannot clear",
    timeout: timeoutMs,
  });
  if (armed.ok !== true) {
    return fail("failed", `${name} would not arm the wait`, armed);
  }
  process.stderr.write(`qsm-web browserbox: open ${view} and clear the wall\n`);
  if (box.dryRun) {
    return ok({ liveView: view }, view);
  }
  if (flagArg(call, "open")) {
    spawnSync("xdg-open", [view], { stdio: "ignore" });
  }
  if (cleared(box, name, tab, timeoutMs)) {
    return ok({ resumed: true, liveView: view }, `${name} tab ${tab} was cleared`);
  }
  return fail("failed", `nobody cleared ${name} tab ${tab} in time`, {
    resumed: false,
    liveView: view,
  });
}

type BoxHandler = (call: Call, box: Box) => Outcome;

/**
 * Every verb gets its own Box, and under --dry-run answers with the commands it collected instead
 * of the data it never produced. A QsmError thrown below reaches the CLI base.
 */
function handler(run: BoxHandler): Handler {
  return (call) => {
    const box = new Box(flagArg(call, "dryRun"));
    const outcome = run(call, box);
    if (!box.dryRun || outcome.code !== "ok") {
      return outcome;
    }
    return ok({ dryRun: true, commands: box.commands }, box.commands.join("\n"));
  };
}

export const handlers: Readonly<Record<string, Handler>> = {
  "browserbox start": handler(start),
  "browserbox ls": handler(ls),
  "browserbox stop": handler(stop),
  "browserbox fetch": handler(fetchOne),
  "browserbox script": handler(runScript),
  "browserbox takeover": handler(takeover),
};
