// A command that outlives its caller: a session-end hook has 1.5 s, so a verb that takes longer
// starts itself again in its own session and returns.

import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { which } from "bun";

/**
 * Starts `command` from the env's PATH in its own session with stdout and stderr in `log.file`
 * (added to when `log.append`, else replaced) and does not wait for it. Returns null once
 * started, else the reason: a command that is not on PATH is the one failure it reports.
 */
export function spawnDetached(
  command: string,
  args: readonly string[],
  log: { readonly file: string; readonly append: boolean },
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  if (which(command, { PATH: env.PATH ?? "" }) === null) {
    return `${command} is not on PATH`;
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
  } finally {
    closeSync(fd);
  }
  return null;
}
