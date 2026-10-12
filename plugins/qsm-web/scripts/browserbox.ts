// qsm-web browserbox: the last rung.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Call, Handler } from "../../../lib/cli-base.ts";
import { fail, type Outcome, ok } from "../../../lib/outcome.ts";
import { BoxError } from "../lib/box-error.ts";
import {
  buildDefinition,
  chooseRuntime,
  execDefinition,
  type Instance,
  imagePresentDefinition,
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

function onPath(cmd: string): boolean {
  return spawnSync("command", ["-v", cmd], { shell: true, stdio: "ignore" }).status === 0;
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
      throw new BoxError(
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
    const { status, stdout } = spawnSync(this.runtime(), args as string[], {
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
    const text = (stdout ?? "").trim();
    if (status !== 0 && text.length === 0) {
      return { ok: false, error: { kind: "driver", message: `the driver exited ${status ?? 1}` } };
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { ok: false, error: { kind: "driver", message: "the driver answered with non-JSON" } };
    }
  }
}

/** A job as it may be printed: a filled value is replaced by its marker. */
function redact(job: Record<string, unknown>): Record<string, unknown> {
  const { steps } = job;
  if (!Array.isArray(steps)) {
    return job;
  }
  const shown = steps.map((s: Record<string, unknown>) =>
    s.redact === true ? { ...s, value: "[redacted]" } : s,
  );
  return { ...job, steps: shown };
}

function instances(box: Box): Instance[] {
  const { stdout } = box.run(listDefinition());
  const lines = stdout.split("\n").map((line) => {
    const name = line.trim().split(/\s+/)[0] ?? "";
    const port = name.startsWith("bbox-") ? name.slice("bbox-".length) : "";
    return port.length > 0 ? `${name} ${port}` : "";
  });
  return parseInstances(lines.join("\n"));
}

function ensureImage(box: Box): void {
  const present = box.run(imagePresentDefinition());
  if (present.status === 0 && !box.dryRun) {
    return;
  }
  const root = pluginRoot(process.env);
  if (root === undefined) {
    throw new BoxError("missing", NO_ROOT);
  }
  const context = join(root, "docker");
  process.stderr.write(`qsm-web browserbox: building the image from ${context}\n`);
  const built = box.run(buildDefinition(context), false);
  if (built.status !== 0) {
    throw new BoxError("failed", `the image build failed (exit ${built.status})`);
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
    throw new BoxError("failed", "every live-view port in the block is taken");
  }
  const name = instanceName(port);
  const where = out ?? outDir(process.env, homedir(), name);
  if (!box.dryRun) {
    mkdirSync(where, { recursive: true });
  }
  const liveView = liveViewUrl(port);
  const started = box.run(runDefinition({ name, port, outDir: where, liveView }));
  if (started.status !== 0) {
    throw new BoxError("failed", `the instance would not start (exit ${started.status})`);
  }
  if (!ready(box, name)) {
    box.run(stopDefinition(name));
    throw new BoxError(
      "failed",
      `${name} started but its browser never answered; nothing was left running`,
    );
  }
  return { name, port, liveView, out: where };
}

function start({ args }: Call, box: Box): Outcome {
  const instance = startInstance(box, args.out as string | undefined);
  return ok(instance, JSON.stringify(instance));
}

function ls(_call: Call, box: Box): Outcome {
  const live = instances(box);
  return ok(live, JSON.stringify(live));
}

function stop({ args }: Call, box: Box): Outcome {
  const name = args.name as string | undefined;
  const all = args.all === true;
  if (all === (name !== undefined)) {
    return fail("usage", "stop takes exactly one of an instance name and --all");
  }
  if (all) {
    for (const i of instances(box)) {
      box.run(stopDefinition(i.name));
    }
    return ok({ stopped: "all" }, "stopped every instance");
  }
  const { status } = box.run(stopDefinition(name as string));
  if (status !== 0) {
    throw new BoxError("failed", `${name} could not be stopped (exit ${status})`);
  }
  return ok({ stopped: name }, `stopped ${name}`);
}

/** One address, one result. */
function fetchOne({ args }: Call, box: Box): Outcome {
  const given = args.in as string | undefined;
  const keep = args.keep === true;
  const name = given ?? startInstance(box).name;
  const job: Record<string, unknown> = {
    cmd: "fetch",
    url: args.url as string,
    html: args.html === true,
    screenshot: args.screenshot === true,
    cookies: args.cookies === true,
    keep,
  };
  if (args.settle !== undefined) {
    job.settle = args.settle;
  }
  if (args.timeout !== undefined) {
    job.timeout = args.timeout;
  }
  const answer = box.send(name, job);
  const result: Record<string, unknown> = { ...answer, instance: name };
  if (given === undefined && !keep) {
    box.run(stopDefinition(name));
  }
  return answer.ok === true
    ? ok(result, JSON.stringify(result))
    : fail("failed", `${args.url as string} could not be fetched`, result);
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
    throw new BoxError("missing", "a fill-secret step needs the rbw or bw client on PATH");
  }
  const values = new Map<number, string>();
  for (const { index, step } of needed) {
    const value = readValue(
      cli,
      (cmd, args) => {
        const r = spawnSync(cmd, args as string[], { encoding: "utf8" });
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
      throw BoxError.because(err, "failed", `${where}${err.message}`);
    }
    if (err instanceof VaultError) {
      throw BoxError.because(err, "failed", err.message);
    }
    throw err;
  }
}

function runScript({ args }: Call, box: Box): Outcome {
  const file = args.file as string | undefined;
  const steps = args.steps as string | undefined;
  if ((file === undefined) === (steps === undefined)) {
    return fail("usage", "script takes exactly one of --file and --steps");
  }
  const job = readJob(box, file, steps);
  const result = box.send(args.name as string, { cmd: "script", ...job });
  return result.ok === true
    ? ok(result, JSON.stringify(result))
    : fail("failed", "the script did not finish", result);
}

/**
 * Hand one tab to a human: arm the wait, name the page to open, and poll until the wall is gone or
 * the caller's timeout passes.
 */
function takeover({ args }: Call, box: Box): Outcome {
  const name = args.name as string;
  const tab = args.tab as number;
  const timeoutMs = (args.timeout as number | undefined) ?? DEFAULT_WAIT_MS;
  const view = liveViewUrl(Number(name.replace(/^bbox-/, "")));
  const armed = box.send(name, {
    cmd: "wait_for_human",
    tab,
    reason: (args.reason as string | undefined) ?? "a wall the agent cannot clear",
    timeout: timeoutMs,
  });
  if (armed.ok !== true) {
    return fail("failed", `${name} would not arm the wait`, armed);
  }
  process.stderr.write(`qsm-web browserbox: open ${view} and clear the wall\n`);
  if (box.dryRun) {
    return ok({ liveView: view }, view);
  }
  if (args.open === true) {
    spawnSync("xdg-open", [view], { stdio: "ignore" });
  }
  const deadline = Date.now() + timeoutMs + POLL_PAUSE_MS;
  while (Date.now() < deadline) {
    pause(POLL_PAUSE_MS);
    const status = box.send(name, { cmd: "wait_status", tab }, true);
    if (status.state === "cleared") {
      const cleared = { resumed: true, liveView: view };
      return ok(cleared, `${name} tab ${tab} was cleared`);
    }
    if (status.state === "timeout") {
      break;
    }
  }
  return fail("failed", `nobody cleared ${name} tab ${tab} in time`, {
    resumed: false,
    liveView: view,
  });
}

type BoxHandler = (call: Call, box: Box) => Outcome;

/**
 * Every verb gets its own Box, turns a BoxError into its outcome, and under --dry-run answers with
 * the commands it collected instead of the data it never produced.
 */
function handler(run: BoxHandler): Handler {
  return (call) => {
    const box = new Box(call.args.dryRun === true);
    let outcome: Outcome;
    try {
      outcome = run(call, box);
    } catch (err: unknown) {
      if (!(err instanceof BoxError)) {
        throw err;
      }
      outcome = fail(err.code, err.message);
    }
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
