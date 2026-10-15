// The pane is a Quickshell instance of its own, started on demand and addressed by its config
// path: `qs ipc` without -p picks the oldest instance, which may be the person's desktop shell.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { sleep, which } from "bun";
import type { Env } from "../../../../lib/paths.ts";
import { fail } from "../errors.ts";
import { paneDir } from "./paths.ts";

const TARGET = "askpass";
const TRIES = 40;
const WAIT_MS = 250;

function qs(args: readonly string[], env: Env): { status: number; stdout: string; stderr: string } {
  const done = spawnSync("qs", [...args], { encoding: "utf8", env: { ...env } });
  return { status: done.status ?? 1, stdout: done.stdout ?? "", stderr: done.stderr ?? "" };
}

/**
 * Puts one request in front of the person: starts the pane's instance when none runs, then calls its
 * `askpass` target until it answers. Quickshell absent, the pane not installed, or a target that
 * never answers is `missing`; there is no other way to ask.
 */
export async function showPane(env: Env, request: object): Promise<void> {
  if (which("qs", { PATH: env.PATH ?? "" }) === null) {
    fail(
      "quickshell (qs) is not on PATH",
      "install quickshell; the askpass pane runs on it",
      "missing",
    );
  }
  const dir = paneDir(env);
  if (!existsSync(`${dir}/shell.qml`)) {
    fail(
      `the askpass pane is not installed at ${dir}`,
      "run qsm-setup install qsm-secrets",
      "missing",
    );
  }
  // -n: an instance of this config already running is kept, not doubled.
  qs(["-p", dir, "-n", "-d"], env);
  let last = "";
  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    const called = qs(["ipc", "-p", dir, "call", TARGET, "request", JSON.stringify(request)], env);
    if (called.status === 0 && called.stdout.trim() === "queued") {
      return;
    }
    last = (called.stderr || called.stdout).trim().split("\n").at(-1) ?? "";
    if (called.status === 0) {
      break;
    }
    await sleep(WAIT_MS);
  }
  fail(`the askpass pane did not take the request: ${last}`, `check qs log -p ${dir}`, "missing");
}

/** Takes the request back off the screen; best effort, because the call is over either way. */
export function dismissPane(env: Env, nonce: string): void {
  qs(["ipc", "-p", paneDir(env), "call", TARGET, "withdraw", nonce], env);
}
