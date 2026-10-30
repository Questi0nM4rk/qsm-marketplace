// A command that outlives its caller: a session-end hook has 1.5 s, so a verb that takes longer
// starts itself again in its own session and returns.

import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { which } from "bun";

/** Whether `pid` names a live process; EPERM means it lives but is not ours. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return cause instanceof Error && "code" in cause && cause.code === "EPERM";
  }
}

export type Detached =
  | { readonly ok: true; readonly pid: number }
  | { readonly ok: false; readonly reason: string };

/**
 * Starts `command` from the env's PATH in its own session with stdout and stderr in `log.file`
 * (added to when `log.append`, else replaced) and does not wait for it. Answers the child's pid,
 * which is also its process group, so a caller can take down what it started; else the reason: a
 * command that is not on PATH, or a spawn that gave no pid.
 */
export function spawnDetached(
  command: string,
  args: readonly string[],
  log: { readonly file: string; readonly append: boolean },
  env: Readonly<Record<string, string | undefined>>,
): Detached {
  if (which(command, { PATH: env.PATH ?? "" }) === null) {
    return { ok: false, reason: `${command} is not on PATH` };
  }
  const fd = openSync(log.file, log.append ? "a" : "w", 0o600);
  try {
    const child = spawn(command, [...args], {
      detached: true,
      stdio: ["ignore", fd, fd],
      env: { ...env },
    });
    // A spawn error after this point lands in no one's hands; it must not crash the caller.
    child.on("error", () => {});
    child.unref();
    return child.pid === undefined
      ? { ok: false, reason: `${command} did not start` }
      : { ok: true, pid: child.pid };
  } finally {
    closeSync(fd);
  }
}
