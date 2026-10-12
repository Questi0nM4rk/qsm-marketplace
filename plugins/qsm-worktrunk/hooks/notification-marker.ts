#!/usr/bin/env bun
// Claude Code Notification hook: when the harness raises a notification to the user, the shared
// activity marker is set to waiting, so a shell prompt or status line shows it without polling.
// classic: Notification has no function event.

import { runMain } from "../../../lib/hooks-kit.ts";
import { nodeRunner } from "../lib/node-io.ts";
import { setMarker } from "../lib/wt.ts";

function log(msg: string): void {
  process.stderr.write(`[qsm-worktrunk-notification-marker] ${msg}\n`);
}

async function main(): Promise<void> {
  const set = await setMarker(nodeRunner(), "waiting");
  if (!set) {
    log("wt could not set the waiting marker");
  }
}

await runMain(import.meta.main, main, log);
