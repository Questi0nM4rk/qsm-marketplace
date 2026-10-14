#!/usr/bin/env bun
// classic: WorktreeCreate has no function event. Claude Code WorktreeCreate hook: the harness needs a new isolated
// workspace for a branch, and this creates or reuses it through `wt switch
// --create`, then hands back the path `git worktree list` reports for that
// branch, and points the new workspace at the main checkout's task store so
// its ready list is the same everywhere. A classic command hook, not a
// `classic.WorktreeCreate` handler in the hooks module: the engine's
// sec-default module skips a user-tier module's classic.* handlers on a
// machine with managed settings (epic qsm-dr5r).
//
// Build: bun build --compile --target bun --outfile dist/worktree-create hooks/worktree-create.ts
//
// Iron Law, with one exception: every other hook in this plugin never
// crashes and never blocks, because a missing optimisation must never become
// a failed request. This one is the opposite. A workspace the harness asked
// for and did not get through `wt` must not be created by the harness's own
// fallback path either, because then `wt` does not know about it, the task
// store is never redirected, and nobody learns why. So a failure here is
// loud on purpose: the message goes to stderr and the process exits 1, which
// fails the harness's request instead of silently falling back.

import { readHookEvent } from "../../../lib/hooks-kit.ts";
import { isRecord } from "../../../lib/outcome.ts";
import { nodeRunner, nodeStoreIo } from "../lib/node-io.ts";
import { writeRedirect } from "../lib/task-store.ts";
import { gitReader, readMainCheckout } from "../lib/workspace.ts";
import { createWorkspace, WtError } from "../lib/wt.ts";

function eventOf(): { readonly name: string; readonly cwd: string } {
  const event = readHookEvent();
  if (!isRecord(event) || typeof event.name !== "string" || typeof event.cwd !== "string") {
    throw new Error("missing name or cwd on stdin");
  }
  return { name: event.name, cwd: event.cwd };
}

async function createAndAnnounce(): Promise<void> {
  const { name, cwd } = eventOf();
  const run = nodeRunner();
  const path = await createWorkspace(run, name, cwd);
  const mainCheckout = await readMainCheckout(gitReader(run, cwd));
  if (mainCheckout !== null) {
    await writeRedirect(nodeStoreIo(), path, mainCheckout);
  }
  // A WorktreeCreate command hook answers with the bare path: the harness reads its whole stdout as
  // the path and does not parse hookSpecificOutput here (that shape is for a callback hook).
  process.stdout.write(`${path}\n`);
}

try {
  await createAndAnnounce();
  process.exit(0);
} catch (error) {
  const message =
    error instanceof WtError || error instanceof Error ? error.message : String(error);
  process.stderr.write(`qsm-worktrunk: ${message}. Run /qsm-worktrunk.\n`);
  process.exit(1);
}
