// The contract every plugin installer implements: scripts/install.ts exports install(ctx):
// Promise<InstallResult>.
import { spawnSync } from "node:child_process";
import { exitOf, fail, type Outcome, ok, renderJson } from "./outcome.ts";

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
function realContext(opts: { dryRun?: boolean } = {}): InstallContext {
  return { dryRun: opts.dryRun ?? false, env: process.env, probe: realProbe, run: realRun };
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

/** One-line CLI entry: `if (import.meta.main) process.exit(await cliMain(install));`
 * Flags: --dry-run, --json (the outcome envelope, steps as data). */
export async function cliMain(install: InstallFn, argv: string[] = process.argv): Promise<number> {
  const r = await install(realContext({ dryRun: argv.includes("--dry-run") }));
  return report(r, argv.includes("--json"));
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

function listValues(values: readonly string[]): string {
  return values.length < 2
    ? values.join("")
    : `${values.slice(0, -1).join(", ")} or ${values.at(-1)}`;
}

/** The choices from argv, or the usage message naming what is missing. */
function readChoices(
  options: readonly ActivationOption[],
  argv: readonly string[],
): Record<string, string> | string {
  const choices: Record<string, string> = {};
  for (const option of options) {
    const at = argv.indexOf(`--${option.name}`);
    const value = at === -1 ? undefined : argv[at + 1];
    if (value === undefined) {
      return `activation needs --${option.name} <${option.values.join("|")}>`;
    }
    if (!option.values.includes(value)) {
      return `--${option.name} takes ${listValues(option.values)}, not ${value}`;
    }
    choices[option.name] = value;
  }
  return choices;
}

/**
 * One-line CLI entry for scripts/activate.ts: `if (import.meta.main) process.exit(await
 * activationMain(activation));` Flags: every declared option, --dry-run, --json; `--status`
 * instead reports the state and the options, and writes nothing.
 */
export async function activationMain(
  activation: Activation,
  argv: string[] = process.argv,
): Promise<number> {
  const json = argv.includes("--json");
  if (argv.includes("--status")) {
    let state: ActivationState;
    try {
      state = activation.status(process.env);
    } catch (e) {
      const outcome = fail("failed", e instanceof Error ? e.message : String(e));
      process.stdout.write(json ? renderJson(outcome) : `failed: ${outcome.message}\n`);
      return exitOf(outcome.code);
    }
    const data = { state, options: activation.options };
    process.stdout.write(json ? renderJson(ok(data, state)) : `${state}\n`);
    return 0;
  }
  const choices = readChoices(activation.options, argv);
  if (typeof choices === "string") {
    const outcome = fail("usage", choices);
    if (json) {
      process.stdout.write(renderJson(outcome));
    } else {
      process.stderr.write(`usage: ${choices}\n`);
    }
    return exitOf(outcome.code);
  }
  const r = await activation.activate({
    dryRun: argv.includes("--dry-run"),
    env: process.env,
    choices,
  });
  return report(r, json);
}
