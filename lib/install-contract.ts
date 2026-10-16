// The contract every plugin installer implements: scripts/install.ts exports install(ctx):
// Promise<InstallResult>.
import { spawnSync } from "node:child_process";
import { type Call, flagArg, parseCall, requiredString } from "./cli-base.ts";
import { exitOf, fail, messageOf, type Outcome, ok, renderJson } from "./outcome.ts";
import { type CommandArg, type QsmManifest, toKebab } from "./qsm-manifest.ts";

export type InstallStatus =
  | "installed"
  | "already"
  | "skipped"
  | "suggested"
  | "missing-prereq"
  | "error";

/** One thing an installer did or would do: a binary, a hook, an upstream
 * tool, a completion, one of the plugin's extra steps. */
export interface Step {
  readonly name: string;
  readonly status: InstallStatus;
  readonly detail: string;
}

export interface InstallResult {
  readonly tool: string;
  /** the worst of the steps */
  readonly status: InstallStatus;
  readonly detail: string;
  readonly steps: readonly Step[];
}

export interface InstallContext {
  readonly dryRun: boolean;
  /** replace a link in the bin directory that is not ours, instead of failing; absent is false */
  readonly force?: boolean;
  readonly env: Record<string, string | undefined>;
  /** `command -v <cmd>` */
  readonly probe: (cmd: string) => boolean;
  /** runs a command, returns its exit code */
  readonly run: (cmd: string, args: string[]) => number;
}

/** An installer. */
export type InstallFn = (ctx: InstallContext) => InstallResult | Promise<InstallResult>;

export function isFailure(status: InstallStatus): boolean {
  return status === "missing-prereq" || status === "error";
}

function realProbe(cmd: string): boolean {
  return spawnSync("command", ["-v", cmd], { shell: true, stdio: "ignore" }).status === 0;
}
// A child's stdout goes to our stderr: under --json our stdout carries the one envelope qsm-setup
// reads, and a package manager's progress there would make it unreadable.
function realRun(cmd: string, args: string[]): number {
  return spawnSync(cmd, args, { stdio: ["ignore", 2, 2] }).status ?? 1;
}
function realContext(opts: { dryRun: boolean; force: boolean }): InstallContext {
  return { ...opts, env: process.env, probe: realProbe, run: realRun };
}

/**
 * The whole of a packaged tool's install: skip when the environment says so, probe the
 * prerequisite, run the install, link the binary onto PATH.
 */

/** Install statuses on the marketplace-wide outcome table: error is failed,
 * missing-prereq is missing, everything else (a suggestion included) is ok. */
function outcomeOf(r: InstallResult): Outcome<InstallResult> {
  if (r.status === "error") {
    return fail("failed", r.detail, r);
  }
  if (r.status === "missing-prereq") {
    return fail("missing", r.detail, r);
  }
  return ok(r, `${r.status}: ${r.detail}`);
}

/** An installer's own flags, declared as a manifest so parseCall reads them like any qsm CLI's. */
const flag = (name: string, description: string): CommandArg => ({
  name,
  type: "boolean",
  description,
});
const DRY_RUN = flag("dryRun", "plan the work, change nothing");
const FORCE = flag("force", "replace a link in the bin directory that is not ours");

/** The call, or the usage message: an unknown flag or a missing value is never ignored. */
function parseArgv(args: readonly CommandArg[], argv: readonly string[]): Call | string {
  const manifest: QsmManifest = {
    qsm: { commands: { "install run": { description: "installer", args } } },
  };
  const parsed = parseCall(manifest, "install", ["run", ...argv]);
  if (parsed.ok) {
    return parsed.call;
  }
  return parsed.message === ""
    ? `flags: ${args.map((a) => `--${toKebab(a.name)}`).join(", ")}, --json`
    : parsed.message;
}

/** A usage failure, in the form the caller asked for. */
function usage(message: string, json: boolean): number {
  const outcome = fail("usage", message);
  if (json) {
    process.stdout.write(renderJson(outcome));
  } else {
    process.stderr.write(`usage: ${message}\n`);
  }
  return exitOf(outcome.code);
}

/** One-line CLI entry: `if (import.meta.main) process.exit(await cliMain(install));`
 * Flags: --dry-run, --force, --json (the outcome envelope, steps as data). */
export async function cliMain(
  install: InstallFn,
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> {
  const call = parseArgv([DRY_RUN, FORCE], argv);
  if (typeof call === "string") {
    return usage(call, argv.includes("--json"));
  }
  const ctx = realContext({ dryRun: flagArg(call, "dryRun"), force: flagArg(call, "force") });
  return report(await install(ctx), call.json);
}

/** An install or activation result: the envelope under --json, else lines on stderr. */
function report(r: InstallResult, json: boolean): number {
  const outcome = outcomeOf(r);
  if (json) {
    process.stdout.write(renderJson(outcome));
  } else {
    process.stderr.write(`${r.status}: ${r.detail}\n`);
    for (const s of r.steps) {
      process.stderr.write(`  ${s.name}: ${s.status} ${s.detail}\n`);
    }
  }
  return exitOf(outcome.code);
}

/** A choice an activation takes from the user, as `--<name> <value>`. */
export interface ActivationOption {
  readonly name: string;
  readonly values: readonly string[];
  readonly description: string;
}

export interface ActivationContext {
  readonly dryRun: boolean;
  readonly env: Record<string, string | undefined>;
  /** one value per declared option, always present */
  readonly choices: Readonly<Record<string, string>>;
}

/** absent: never activated; differs: activated, but not what activation would write now. */
export type ActivationState = "activated" | "absent" | "differs";

/**
 * The contract for scripts/activate.ts: the one place a plugin changes a file the user owns (the
 * Claude home, settings).
 */
export interface Activation {
  readonly options: readonly ActivationOption[];
  /** Whether the user's files hold what activation writes; a read, never a write. Throws, naming the cause, when the files cannot be read as a state. */
  readonly status: (env: ActivationContext["env"]) => ActivationState;
  readonly activate: (ctx: ActivationContext) => InstallResult | Promise<InstallResult>;
}

/**
 * One-line CLI entry for scripts/activate.ts: `if (import.meta.main) process.exit(await
 * activationMain(activation));` Flags: every declared option, --dry-run, --json; `--status`
 * instead reports the state and the options, and writes nothing.
 */
export async function activationMain(
  activation: Activation,
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> {
  const status = argv.includes("--status");
  const choices: CommandArg[] = activation.options.map((o) => ({
    name: o.name,
    type: "string",
    required: true,
    choices: o.values,
    description: o.description,
  }));
  const call = parseArgv(
    status ? [flag("status", "report the state")] : [DRY_RUN, ...choices],
    argv,
  );
  if (typeof call === "string") {
    return usage(call, argv.includes("--json"));
  }
  if (status) {
    let state: ActivationState;
    try {
      state = activation.status(process.env);
    } catch (e) {
      const outcome = fail("failed", messageOf(e));
      process.stdout.write(call.json ? renderJson(outcome) : `failed: ${outcome.message}\n`);
      return exitOf(outcome.code);
    }
    const data = { state, options: activation.options };
    process.stdout.write(call.json ? renderJson(ok(data, state)) : `${state}\n`);
    return 0;
  }
  const r = await activation.activate({
    dryRun: flagArg(call, "dryRun"),
    env: process.env,
    choices: Object.fromEntries(
      activation.options.map((o) => [o.name, requiredString(call, o.name)]),
    ),
  });
  return report(r, call.json);
}
