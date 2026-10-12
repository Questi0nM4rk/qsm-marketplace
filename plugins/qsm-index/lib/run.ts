// One way to call a local command, and one way to describe what came back.

import { spawnSync } from "node:child_process";
import type { Env } from "./paths.ts";

export interface RunResult {
  readonly ok: boolean;
  readonly stdout: string;
  /** Empty when ok; otherwise the cause, in a line a caller can print. */
  readonly detail: string;
}

export type Runner = (command: string, args: readonly string[]) => RunResult;

/** A little under the 30 s an MCP client waits for one tool call, so a slow command answers an
 * error result before the client gives up on the call. */
const CALL_LIMIT_MS = 25_000;
const MAX_OUTPUT_CHARS = 40_000;

/** Long output is a tool call's own problem, never the reader's. */
function cap(text: string): string {
  return text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n[truncated]` : text;
}

/** A runner that runs a command with `env` and never throws: a missing binary, a non-zero exit
 * and a run past `timeoutMs` all come back as `ok: false` with the cause in `detail`. */
export function timedRunner(timeoutMs: number, env: Env): Runner {
  return (command, args) => {
    const result = spawnSync(command, [...args], { encoding: "utf8", timeout: timeoutMs, env });
    const stdout = cap(result.stdout ?? "");
    if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT") {
      return {
        ok: false,
        stdout,
        detail: `${command} ran past the ${timeoutMs} ms call limit and was stopped`,
      };
    }
    if (result.error !== undefined) {
      return { ok: false, stdout, detail: `${command} is not available: ${result.error.message}` };
    }
    if (result.signal !== null) {
      return { ok: false, stdout, detail: `${command} was killed by ${result.signal}` };
    }
    if (result.status !== 0) {
      const stderr = cap((result.stderr ?? "").trim());
      return {
        ok: false,
        stdout,
        detail: `${command} exited ${result.status ?? 1}${stderr.length === 0 ? "" : `: ${stderr}`}`,
      };
    }
    return { ok: true, stdout, detail: "" };
  };
}

/** The runner every interface uses: the process's own environment, stopped under the MCP
 * per-call limit. */
export const spawnRunner: Runner = timedRunner(CALL_LIMIT_MS, process.env);
