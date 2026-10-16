// A watch on the marketplace for the served page: one non-recursive watcher per directory, so the
// directories nobody reads (.git, node_modules, the generated .qsm, eval results) never cost an
// inotify watch, and a change burst becomes one call to `onChange`.

import { type FSWatcher, readdirSync, statSync, watch } from "node:fs";
import { basename, join } from "node:path";

/** Never watched, wherever they sit. `.claude` holds the agent's worktrees, full copies of the tree. */
const NEVER = new Set([".git", "node_modules", ".qsm", ".claude", "dist"]);

/** What of a directory counts: eval results are generated, and beads writes a database on every read. */
function ignored(dir: string, name: string): boolean {
  if (NEVER.has(name)) {
    return true;
  }
  if (name === "results" && basename(dir) === "evals") {
    return true;
  }
  return basename(dir) === ".beads" && name !== "issues.jsonl";
}

/** Calls `onChange` once per burst of changes; returns the function that stops the watch. */
export function watchMarketplace(root: string, onChange: () => void, delayMs = 120): () => void {
  const watchers = new Map<string, FSWatcher>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(onChange, delayMs);
  };
  const add = (dir: string): void => {
    if (watchers.has(dir)) {
      return;
    }
    let w: FSWatcher;
    try {
      w = watch(dir, (_event, file) => {
        const name = file ?? "";
        if (name === "" || ignored(dir, name)) {
          return;
        }
        // A new directory is watched from now on, and what it already holds counts as changed.
        try {
          if (statSync(join(dir, name)).isDirectory()) {
            walk(join(dir, name));
          }
        } catch {
          // gone again: the change below still fires
        }
        fire();
      });
    } catch {
      return;
    }
    // A removed directory ends its watcher; the parent's event has already fired the change.
    w.on("error", () => {
      w.close();
      watchers.delete(dir);
    });
    watchers.set(dir, w);
  };
  const walk = (dir: string): void => {
    add(dir);
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && !ignored(dir, e.name)) {
        walk(join(dir, e.name));
      }
    }
  };
  walk(root);
  return () => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    for (const w of watchers.values()) {
      w.close();
    }
    watchers.clear();
  };
}
