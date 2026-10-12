// Where a backend's command-line tool is.

import { spawnSync } from "node:child_process";
import type { Check } from "./doctor.ts";

/** Where `bin` is, or null. `command -v` rather than a PATH walk of
 * our own: it is the same answer the shell would give the caller. */
export function binPath(bin: string): string | null {
  const found = spawnSync("command", ["-v", bin], { shell: true, encoding: "utf8" });
  const path = found.stdout.trim();
  return found.status === 0 && path.length > 0 ? path : null;
}

/** The doctor line for "is `bin` installed", with the step that fixes it. */
export function binCheck(bin: string, fix: string): Check {
  const path = binPath(bin);
  return path === null
    ? { name: `${bin} on PATH`, ok: false, detail: "not found", fix }
    : { name: `${bin} on PATH`, ok: true, detail: path, fix: null };
}
