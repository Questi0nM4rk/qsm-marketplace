#!/usr/bin/env bun
// classic: WorktreeRemove has no function event. Claude Code WorktreeRemove hook: the harness is done with an isolated
// workspace, and this resolves the branch checked out at that path and
// removes it through `wt remove`, foreground, workspace and branch together
// unless the branch holds something unmerged. A classic command hook, not a
// `classic.WorktreeRemove` handler in the hooks module: the engine's
// sec-default module skips a user-tier module's classic.* handlers on a
// machine with managed settings (epic qsm-dr5r).
//
// Build: bun build --compile --target bun --outfile dist/worktree-remove hooks/worktree-remove.ts
//
// Iron Law, with one exception, the same one hooks/worktree-create.ts takes:
// a workspace the harness believes is gone but `wt` never removed would keep
// its branch alive and its task store redirect pointed at a workspace that
// no longer exists. So a failure here is loud on purpose: the message goes
// to stderr and the process exits 1, which fails the harness's request
// instead of silently leaving the workspace behind.

import { readHookEvent } from "../../../lib/hooks-kit.ts";
import { isRecord, messageOf } from "../../../lib/outcome.ts";
import { nodeRunner } from "../lib/node-io.ts";
import { removeWorkspace } from "../lib/wt.ts";

function eventOf(): { readonly worktreePath: string; readonly cwd: string } {
  const event = readHookEvent();
  if (
    !isRecord(event) ||
    typeof event.worktree_path !== "string" ||
    typeof event.cwd !== "string"
  ) {
    throw new Error("missing worktree_path or cwd on stdin");
  }
  return { worktreePath: event.worktree_path, cwd: event.cwd };
}

async function removeAndAnnounce(): Promise<void> {
  const { worktreePath, cwd } = eventOf();
  await removeWorkspace(nodeRunner(), worktreePath, cwd);
}

try {
  await removeAndAnnounce();
  process.exit(0);
} catch (error) {
  process.stderr.write(`qsm-worktrunk: ${messageOf(error)}. Run /qsm-worktrunk.\n`);
  process.exit(1);
}
