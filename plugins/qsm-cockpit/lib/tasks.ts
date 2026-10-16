// The claimed tasks, as the task tool's `br list` says them.
import { spawnSync } from "node:child_process";
import { isRecord } from "../../../lib/outcome.ts";
import { QsmError } from "../../../lib/qsm-error.ts";
import type { Task } from "../types/state.d.ts";
import { tasksOf } from "./cockpit.ts";

/** The in-progress tasks `br list --json` printed: each issue that has an id and a title. */
export function parseIssues(stdout: string): Task[] {
  const parsed: unknown = JSON.parse(stdout);
  return tasksOf(isRecord(parsed) ? parsed.issues : undefined);
}

/** The in-progress tasks of the tracker in the working directory. */
export function inProgress(): Task[] {
  const run = spawnSync("br", ["list", "-s", "in_progress", "--json"], {
    encoding: "utf8",
    timeout: 5000,
  });
  if (run.error !== undefined) {
    throw new QsmError("missing", `br did not run: ${run.error.message}`, {
      next: "install qsm-tasks",
    });
  }
  if (run.status !== 0) {
    throw new QsmError(
      "failed",
      `br list failed (${run.status}): ${run.stderr.trim().slice(0, 200)}`,
    );
  }
  return parseIssues(run.stdout);
}
