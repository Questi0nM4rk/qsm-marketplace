// How a test runs a CLI: one spawner, one clean environment, one reader of what it printed.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { type Envelope, isRecord, OUTCOME_CODES, type OutcomeCode } from "../outcome.ts";
import { sandboxDir } from "./sandbox.ts";

/** What a child needs to run and nothing the machine owns: PATH and TMPDIR from this run, HOME and
 * the XDG dirs inside `home`, then `extra`. No token, no config dir, no editor setting comes along. */
export function isolatedEnv(
  home: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
    HOME: home,
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_DATA_HOME: join(home, "data"),
    XDG_CACHE_HOME: join(home, "cache"),
    ...extra,
  };
}

interface BinRun {
  readonly exit: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs a bun script the way a shell would. The environment is exactly `env`, or a fresh
 * `isolatedEnv` when none is given. */
export function runBin(
  script: string,
  argv: readonly string[] = [],
  opts: { env?: Record<string, string>; cwd?: string; input?: string } = {},
): BinRun {
  const r = spawnSync(process.execPath, [script, ...argv], {
    encoding: "utf8",
    env: opts.env ?? isolatedEnv(sandboxDir("qsm-bin-")),
    cwd: opts.cwd,
    input: opts.input,
  });
  return { exit: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
}

function isOutcomeCode(value: unknown): value is OutcomeCode {
  return OUTCOME_CODES.some((code) => code === value);
}

/** The outcome envelope a CLI printed under `--json`; anything else fails the test. */
export function envelopeOf(stdout: string): Envelope {
  const parsed: unknown = JSON.parse(stdout);
  if (
    !isRecord(parsed) ||
    !isOutcomeCode(parsed.code) ||
    typeof parsed.exit !== "number" ||
    typeof parsed.reason !== "string" ||
    typeof parsed.message !== "string" ||
    !Array.isArray(parsed.warnings) ||
    !parsed.warnings.every((warning) => typeof warning === "string")
  ) {
    throw new Error(`not an envelope: ${stdout}`);
  }
  return {
    code: parsed.code,
    exit: parsed.exit,
    reason: parsed.reason,
    message: parsed.message,
    warnings: parsed.warnings,
    data: parsed.data,
  };
}

/** The `data` of the envelope a CLI printed under `--json`. */
export function dataOf(stdout: string): unknown {
  return envelopeOf(stdout).data;
}
