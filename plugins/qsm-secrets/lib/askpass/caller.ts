// Who is asking, as far as /proc says: the parent of this process. Shown in the pane so the person
// sees which binary wants the answer. A process of another uid hides its exe; that is said, not guessed.

import { readFileSync, readlinkSync } from "node:fs";
import { sha256 } from "../../../../lib/install-base.ts";

export interface Caller {
  readonly pid: number;
  /** the resolved executable, or why it cannot be read */
  readonly exe: string;
  /** the first 12 hex of the executable's sha256, empty when unreadable */
  readonly sha12: string;
  /** the parent's own command line, which for sudo is the command it will run */
  readonly cmdline: string;
}

export function callerOf(pid: number): Caller {
  let exe = "";
  let sha12 = "";
  try {
    exe = readlinkSync(`/proc/${pid}/exe`);
    sha12 = sha256(`/proc/${pid}/exe`).slice(0, 12);
  } catch {
    exe ||= "(executable not readable)";
  }
  let cmdline = "";
  try {
    cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll(/[\s\0]+/g, " ").trim();
  } catch {
    // an unreadable command line is shown as empty
  }
  return { pid, exe, sha12, cmdline };
}
