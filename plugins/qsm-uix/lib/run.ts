// Running an external tool, and telling its absence apart from its failure.

import { spawnSync } from "node:child_process";
import { CaptureError, missingToolError } from "./errors.ts";

export interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export type Command = readonly [string, ...string[]];

export function run(cmd: Command): RunResult {
  const [program, ...args] = cmd;
  const done = spawnSync(program, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (done.error !== undefined) {
    if ((done.error as NodeJS.ErrnoException).code === "ENOENT") {
      throw missingToolError(program);
    }
    throw new CaptureError(`${program} could not be run: ${done.error.message}`);
  }
  return { stdout: done.stdout ?? "", stderr: done.stderr ?? "", exitCode: done.status ?? 1 };
}

/** For a tool whose non-zero exit is always a failure. The `diff` verb reads
 * its tool's exit code itself, so it calls `run` instead. */
export function runOrThrow(cmd: Command): RunResult {
  const result = run(cmd);
  if (result.exitCode !== 0) {
    const said = result.stderr.trim().length > 0 ? result.stderr.trim() : result.stdout.trim();
    throw new CaptureError(`${cmd[0]} failed (exit ${result.exitCode}): ${said}`);
  }
  return result;
}
