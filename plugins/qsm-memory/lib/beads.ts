// The in-progress tasks of the repository at `cwd` and the epic each belongs to, read from the
// task tool (qsm-tasks, the `br` binary). A project with no `.beads/` above `cwd` has no tracker
// and gets an empty answer; a tracker whose tool is not on PATH fails as `TrackerMissing` naming
// qsm-tasks, and any other failure is loud.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Env } from "./store.ts";

/** The repository has a tracker and the task tool that reads it is not installed. */
export class TrackerMissing extends Error {}

export interface Bead {
  readonly id: string;
  readonly title: string;
  readonly epic: { readonly id: string; readonly title: string } | null;
}

interface Issue {
  readonly id?: string;
  readonly title?: string;
  readonly parent?: string;
}

function hasTracker(cwd: string): boolean {
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".beads"))) {
      return true;
    }
    if (dirname(dir) === dir) {
      return false;
    }
  }
}

/** The JSON `br <args>` prints. */
function br(args: readonly string[], cwd: string, env: Env): unknown {
  const r = spawnSync("br", [...args], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  if (r.error !== undefined && "code" in r.error && r.error.code === "ENOENT") {
    throw new TrackerMissing(
      "the task tool is not on PATH but this repository has a task tracker (.beads/): install qsm-tasks",
    );
  }
  if (r.status !== 0) {
    throw new Error(`br ${args.join(" ")} failed: ${(r.stderr || r.stdout).trim().slice(0, 200)}`);
  }
  return JSON.parse(r.stdout);
}

/** `br show` answers an array of one issue. */
function issue(id: string, cwd: string, env: Env): Issue | undefined {
  const shown = br(["show", id, "--json"], cwd, env);
  return Array.isArray(shown) ? (shown[0] as Issue | undefined) : undefined;
}

export interface Closed {
  readonly id: string;
  readonly closedAt: string;
}

/** The beads closed most recently, newest first: enough to cover the few sessions a briefing
 * names. */
export function recentlyClosed(cwd: string, env: Env = process.env): Closed[] {
  if (!hasTracker(cwd)) {
    return [];
  }
  const listed = br(
    ["list", "-s", "closed", "--sort", "updated_at", "--limit", "50", "--json"],
    cwd,
    env,
  ) as { issues?: (Issue & { closed_at?: string })[] } | null;
  return (listed?.issues ?? []).flatMap((item) =>
    item.id === undefined || item.closed_at === undefined
      ? []
      : [{ id: item.id, closedAt: item.closed_at }],
  );
}

export function inProgress(cwd: string, env: Env = process.env): Bead[] {
  if (!hasTracker(cwd)) {
    return [];
  }
  const listed = br(["list", "-s", "in_progress", "--json"], cwd, env) as { issues?: Issue[] };
  return (listed.issues ?? []).flatMap((item) => {
    if (item.id === undefined) {
      return [];
    }
    const parent = issue(item.id, cwd, env)?.parent;
    const epic = parent === undefined ? undefined : issue(parent, cwd, env);
    return [
      {
        id: item.id,
        title: item.title ?? "",
        epic: parent === undefined ? null : { id: parent, title: epic?.title ?? "" },
      },
    ];
  });
}
