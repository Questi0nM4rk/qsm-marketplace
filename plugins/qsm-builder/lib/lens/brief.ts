// What the agent is told the first time it touches a plugin's files: the plugin's open edits and
// feedback, so a change made on the lens is not met blind.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { pluginOfPath } from "../brief-path.ts";
import { readTasks, type Task, tasksOf } from "./tasks.ts";

const SHOWN = 10;

export interface Brief {
  readonly plugin: string;
  /** null when the file is in no plugin of a marketplace, or the plugin has no open edit or feedback */
  readonly text: string | null;
}

/** Why the tasks could not be read, when they could not. */
export class BriefError extends Error {}

function line(t: Task): string {
  const was =
    t.kind === "new" ? "its file already exists" : "its file changed after the edit was made";
  const stale = t.stale === true ? `, stale: ${was}` : "";
  return `- ${t.id} (${t.kind}${stale}) ${t.title}`;
}

export function briefOf(file: string): Brief | null {
  const where = pluginOfPath(file);
  if (where === null || !existsSync(join(where.root, ".claude-plugin", "marketplace.json"))) {
    return null;
  }
  const { plugin, root } = where;
  if (!existsSync(join(root, "plugins", plugin, ".claude-plugin", "plugin.json"))) {
    return null;
  }
  const read = readTasks(root);
  const tasks = tasksOf(plugin, read.open);
  if (tasks === null) {
    throw new BriefError(read.note);
  }
  const open = tasks.filter((t) => !t.epic && t.kind !== "task");
  if (open.length === 0) {
    return { plugin, text: null };
  }
  const more =
    open.length > SHOWN
      ? [`- and ${open.length - SHOWN} more: qsm-builder lens tasks ${plugin}`]
      : [];
  return {
    plugin,
    text: [
      `${plugin} has ${open.length} open tasks from the lens and from feedback. Before you change its files, show the person each one (what changes, and what you would do or why you refuse), write only after their yes, and close the task with what was done.`,
      ...open.slice(0, SHOWN).map(line),
      ...more,
    ].join("\n"),
  };
}
