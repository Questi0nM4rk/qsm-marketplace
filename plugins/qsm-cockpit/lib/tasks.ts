// The claimed tasks, as the task tool's `br list` says them.
import { spawnSync } from "node:child_process";
import { isRecord } from "../../../lib/outcome.ts";
import { QsmError } from "../../../lib/qsm-error.ts";
import type { Task } from "../types/state.d.ts";
import { tasksOf } from "./cockpit.ts";

/** The in-progress tasks of the tracker in the working directory. */
export function inProgress(): Task[] {
  const run = spawnSync("br", ["list", "-s", "in_progress", "--json"], {
    encoding: "utf8",
    timeout: 5000,
  });
  // only a br that is not there is missing; a br that hangs past the timeout failed
  if (run.error !== undefined && "code" in run.error && run.error.code === "ENOENT") {
    throw new QsmError("missing", `br did not run: ${run.error.message}`, {
      next: "install qsm-tasks",
    });
  }
  if (run.error !== undefined) {
    throw new QsmError("failed", `br list did not finish: ${run.error.message}`);
  }
  if (run.status !== 0) {
    throw new QsmError(
      "failed",
      `br list failed (${run.status}): ${run.stderr.trim().slice(0, 200)}`,
    );
  }
  const parsed: unknown = JSON.parse(run.stdout);
  return tasksOf(isRecord(parsed) ? parsed.issues : undefined);
}
