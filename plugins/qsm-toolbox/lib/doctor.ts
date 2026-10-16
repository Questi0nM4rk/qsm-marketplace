// doctor walks the third-party rows and says, per tool, present with its version or missing with
// the line that installs it.

import { spawnSync } from "node:child_process";
import { onPath } from "../../../lib/outcome.ts";
import { TOOLS, type Tool } from "./catalog.ts";

export interface ToolStatus {
  readonly bin: string;
  readonly present: boolean;
  /** Null when the tool is missing, or present with nothing to report. */
  readonly version: string | null;
  /** Carried on every row so a missing line holds its own fix. */
  readonly install: string;
}

export interface Prober {
  /** `command -v <bin>` */
  readonly onPath: (bin: string) => boolean;
  /** The first line the version flag printed, or null. */
  readonly version: (tool: Tool) => string | null;
}

export function statuses(prober: Prober, tools: readonly Tool[] = TOOLS): ToolStatus[] {
  return tools.map((tool) => {
    const present = prober.onPath(tool.bin);
    return {
      bin: tool.bin,
      present,
      version: present ? prober.version(tool) : null,
      install: tool.install,
    };
  });
}

/** One line per tool, in table order. */
export function lines(report: readonly ToolStatus[]): string[] {
  return report.map((status) => {
    if (!status.present) {
      return `missing  ${status.bin} (install: ${status.install})`;
    }
    return `present  ${status.bin}${status.version === null ? "" : ` ${status.version}`}`;
  });
}

/** How wide the version string may get before it stops being one line. */
const VERSION_WIDTH = 60;

function firstLine(text: string): string | null {
  const line = text.split("\n", 1)[0]?.trim() ?? "";
  return line.length === 0 ? null : line.slice(0, VERSION_WIDTH);
}

/** The impure half: the real machine. Kept here so the CLI stays printing. */
export const realProber: Prober = {
  onPath: (bin) => onPath(bin),
  version: (tool) => {
    const probe = spawnSync(tool.bin, [...tool.versionArgs], { encoding: "utf8" });
    return probe.status === 0 ? firstLine(probe.stdout ?? "") : null;
  },
};
