// Who is asking, as far as /proc says: the parent of this process. Shown in the pane so the person
// sees which binary wants the answer. A process of another uid hides its exe; that is said, not guessed.

import { createHash } from "node:crypto";
import { readFileSync, readlinkSync } from "node:fs";

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
    sha12 = createHash("sha256")
      .update(readFileSync(`/proc/${pid}/exe`))
      .digest("hex")
      .slice(0, 12);
  } catch {
    exe ||= "(executable not readable)";
  }
  let cmdline = "";
  try {
    cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8")
      .split("\0")
      .join(" ")
      .replaceAll(/\s+/g, " ")
      .trim();
  } catch {
    cmdline = "";
  }
  return { pid, exe, sha12, cmdline };
}
