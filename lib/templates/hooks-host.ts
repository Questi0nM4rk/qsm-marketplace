// The host a hooks test stands on, written beside each plugin's noun as hooks/host.generated.ts by
// lib/generate-noun.ts: the engine lets a hooks module import only its own folder and claude-code,
// so this one file is copied, never imported. The ambient claude-code module exists only under a
// plugin's hooks/tsconfig.json, which is why the root tsconfig and the linter leave it out.
import type { On } from "claude-code";

export interface Seen {
  /** each argv `process.run` received, joined by spaces, in order */
  readonly runs: string[];
  readonly toasts: string[];
  readonly logs: string[];
}

export interface Printed {
  readonly stdout: string;
  readonly exitCode: number;
}

/** The stdout and exit a qsm bin has under --json for one answer. */
export function printed(code: string, exit: number, message = "", data: unknown = null): Printed {
  return {
    stdout: JSON.stringify({ code, exit, message, data, reason: "", warnings: [] }),
    exitCode: exit,
  };
}

/** Records every toast and log, and answers each `process.run` with `answer(argv)` when given. */
export function recordingHost(on: On, answer?: (argv: readonly string[]) => Printed): Seen {
  const seen: Seen = { runs: [], toasts: [], logs: [] };
  on("ui.log", (_$, e) => {
    seen.logs.push(e.text);
    return { value: undefined };
  });
  on("ui.toast", (_$, e) => {
    seen.toasts.push(e.text);
    return { value: undefined };
  });
  if (answer !== undefined) {
    on("process.run", (_$, e) => {
      seen.runs.push(e.argv.join(" "));
      return {
        value: {
          ...answer(e.argv),
          stderr: "",
          isStdoutTruncated: false,
          isStderrTruncated: false,
        },
      };
    });
  }
  return seen;
}
