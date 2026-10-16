// Where a backend's command-line tool is.

import { binPath } from "../../../lib/outcome.ts";
import type { Check } from "./doctor.ts";

/** The doctor line for "is `bin` installed", with the step that fixes it. */
export function binCheck(bin: string, fix: string): Check {
  const path = binPath(bin);
  return path === null
    ? { name: `${bin} on PATH`, ok: false, detail: "not found", fix }
    : { name: `${bin} on PATH`, ok: true, detail: path, fix: null };
}
