// A save that outlives its caller: the session-end hook has 1.5 s, a save can take longer. The
// child's outcome is appended to save.log beside the archive; appended, because a session start's
// catch-up and a session end's save can run at once.
// ponytail: save.log only grows, by a line or two per session; truncate it by hand if it matters.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnDetached } from "../../../lib/detach.ts";
import { type Env, resolveDbPath } from "./store.ts";

export type Detached =
  | { readonly started: true; readonly log: string }
  | { readonly started: false; readonly reason: string };

/** Starts `qsm-memory <args>` detached, its output appended to save.log in the archive's directory. */
export function startDetached(args: readonly string[], env: Env): Detached {
  const log = join(dirname(resolveDbPath(env)), "save.log");
  mkdirSync(dirname(log), { recursive: true, mode: 0o700 });
  const failure = spawnDetached("qsm-memory", args, { file: log, append: true }, env);
  return failure === null ? { started: true, log } : { started: false, reason: failure };
}
