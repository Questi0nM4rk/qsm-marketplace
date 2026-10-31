// qsm-worktrunk's function-hooks module: the raw `git worktree` block, the workspace context on
// every prompt, the activity marker, and the doctor command. WorktreeCreate, WorktreeRemove and
// Notification have no function form, so they stay classic command hooks (hooks.json).
import type { EngineInterface, On } from "claude-code";
import { doctor } from "../lib/doctor.ts";
import { denialFor } from "../lib/git-worktree-block.ts";
import {
  gitReader,
  MAIN_CHECKOUT_CONTEXT,
  readWorkspace,
  workspaceContext,
} from "../lib/workspace.ts";
import type { Runner } from "../lib/wt.ts";
import { setMarker } from "../lib/wt.ts";
import { registerNoun } from "./noun.generated.ts";

type Engine = EngineInterface;

function runner($: Engine): Runner {
  return async (argv, cwd) => {
    const result = await $.process.run(argv, cwd === undefined ? undefined : { cwd });
    return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
  };
}

function failure(error: { kind: string; message?: string }): string {
  return `${error.kind}${error.message === undefined ? "" : `: ${error.message.slice(0, 120)}`}`;
}

function registerBlock(on: On): void {
  on("tool.call", { tool: "Bash" }, (_$, e, next) => {
    const denial = denialFor(e.command);
    return denial === null ? next(e) : { deny: denial };
  }).catch(($, _e, next) => {
    const reason = failure(next.error);
    $.ui.toast(`qsm-worktrunk ERROR: tool.call: ${reason}`);
    $.ui.log(`the git worktree block failed (${next.error.kind}); the call was denied`);
    return {
      deny: `qsm-worktrunk: the git worktree block failed (${reason}); the call was not run`,
    };
  });
}

/** The workspace the prompt runs in, as the hidden context line the agent reads; null in the main
 * checkout and outside a repository. */
async function workspaceLine($: Engine): Promise<string | null> {
  const git = gitReader(runner($), await $.session.cwd());
  const workspace = await readWorkspace(git);
  if (workspace !== null) {
    return workspaceContext(workspace, await $.env.get("HOME"));
  }
  return (await git(["rev-parse", "--is-inside-work-tree"])) === "true"
    ? MAIN_CHECKOUT_CONTEXT
    : null;
}

function registerMarker(on: On): void {
  // One prompt.submit handler: the engine takes a second unmatched one for the same event as a
  // load error.
  on("prompt.submit", async ($, e, next) => {
    const line = await workspaceLine($);
    await setMarker(runner($), "working");
    return next(line === null ? e : { ...e, context: [...(e.context ?? []), line] });
  }).catch(($, e, next) => {
    $.ui.toast(`qsm-worktrunk ERROR: prompt.submit: ${failure(next.error)}`);
    $.ui.log(`the working marker or workspace context failed (${next.error.kind})`);
    return next(e);
  });

  on("session.end", async ($, e, next) => {
    await setMarker(runner($), "cleared");
    return next(e);
  }).catch(($, e, next) => {
    const reason = failure(next.error);
    $.ui.toast(`qsm-worktrunk ERROR: session.end: ${reason}`);
    $.ui.log(`clearing the marker failed (${next.error.kind})`);
    return next(e);
  });
}

function registerDoctor(on: On): void {
  // Two halves, and neither works alone: `$.command.register` is what makes `/qsm-worktrunk` a
  // command the engine knows about for this session, and the `command.run` hook below is what
  // answers it.
  on("session.start", async ($, e, next) => {
    try {
      await $.command.register({
        name: "qsm-worktrunk",
        description: "Check that wt is installed and able to create workspaces",
      });
    } catch (error) {
      $.ui.log(`/qsm-worktrunk not registered: ${String(error).slice(0, 120)}`);
    }
    return next(e);
  }).catch(($, e, next) => {
    const reason = failure(next.error);
    $.ui.toast(`qsm-worktrunk ERROR: session.start: ${reason}`);
    $.ui.log(`registering /qsm-worktrunk failed (${next.error.kind})`);
    return next(e);
  });

  on("command.run", { command: "qsm-worktrunk" }, async ($, _e, _next) => {
    const report = await doctor(runner($));
    return { text: report.text };
  }).catch(($, _e, next) => {
    const reason = failure(next.error);
    $.ui.toast(`qsm-worktrunk ERROR: command.run: ${reason}`);
    $.ui.log(`the doctor check failed (${next.error.kind})`);
    return { text: "qsm-worktrunk: the doctor check could not run" };
  });
}

export function register(on: On): void {
  registerNoun(on);
  registerBlock(on);
  registerMarker(on);
  registerDoctor(on);
}
