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

/** How long a caller waits for an answer it needs now (search, structure, status): Claude Code
 * itself sets no limit on a stdio MCP call, so this is the one that stops a stuck command. */
const CALL_LIMIT_MS = 300_000;
const MAX_OUTPUT_CHARS = 40_000;

/** Long output is a tool call's own problem, never the reader's. */
function cap(text: string): string {
  return text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n[truncated]` : text;
}

/** spawnSync stopped the command at its timeout: the error it returns carries ETIMEDOUT. */
function timedOut(error: Error | undefined): boolean {
  return error !== undefined && "code" in error && error.code === "ETIMEDOUT";
}

/** A runner that runs a command with `env` and never throws: a missing binary, a non-zero exit
 * and a run past `timeoutMs` all come back as `ok: false` with the cause in `detail`. With no
 * `timeoutMs` the command runs until it ends. */
export function timedRunner(timeoutMs: number | undefined, env: Env): Runner {
  return (command, args) => {
    const result = spawnSync(command, [...args], { encoding: "utf8", timeout: timeoutMs, env });
    const stdout = cap(result.stdout ?? "");
    if (timedOut(result.error)) {
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

/** The runner of every call that answers now: the process's own environment, stopped at the call
 * limit. */
export const spawnRunner: Runner = timedRunner(CALL_LIMIT_MS, process.env);

/** The runner of the detached build: nobody waits on it, so it runs until graphify and semble end;
 * graphify takes 16 s on this marketplace and 173 s on a repository of 111 MB of generated C#. */
export const buildRunner: Runner = timedRunner(undefined, process.env);
