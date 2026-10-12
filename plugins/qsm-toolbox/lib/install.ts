// Install walks the same table the skill shows.

import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import type { InstallContext, InstallStatus } from "../../../lib/install-contract.ts";
import { binDir, home } from "../../../lib/paths.ts";
import { GO_PREREQ, skipKey, TOOLS, type Tool } from "./catalog.ts";

export interface ToolOutcome {
  readonly bin: string;
  readonly status: InstallStatus;
  readonly detail: string;
}

/** `go install` lands in $GOBIN, or $GOPATH/bin, or ~/go/bin, and none of
 * those is reliably on PATH. Link the result where everything else lands. */
function goBinSource(env: InstallContext["env"], bin: string): string {
  const goPath = env.GOPATH?.split(":")[0];
  const fallback = goPath === undefined || goPath.length === 0 ? resolve(home(env), "go") : goPath;
  return resolve(env.GOBIN ?? resolve(fallback, "bin"), bin);
}

/** Returns an error message, or null when the link is in place. */
function linkFromGoBin(env: InstallContext["env"], bin: string): string | null {
  const source = goBinSource(env, bin);
  if (!existsSync(source)) {
    return `go install reported success but ${source} is not there`;
  }
  const dir = binDir(env);
  mkdirSync(dir, { recursive: true });
  const target = join(dir, bin);
  if (lstatSync(target, { throwIfNoEntry: false }) !== undefined) {
    rmSync(target);
  }
  symlinkSync(source, target);
  return null;
}

/** The line a person types for a row we refuse to run. */
function suggestion(tool: Tool, ctx: InstallContext): string {
  return ctx.probe(tool.prereq)
    ? tool.install
    : `${tool.install} (${tool.prereq} is not on PATH; ${tool.prereqHint})`;
}

/** What one row would do, for the dry run. Same decisions as installOne, so a
 * plan line and the run that follows it never disagree. */
export function planLine(tool: Tool, ctx: InstallContext): string {
  if (ctx.env[skipKey(tool.bin)] === "1") {
    return `${tool.bin}: skipped by ${skipKey(tool.bin)}`;
  }
  if (ctx.probe(tool.bin)) {
    return `${tool.bin}: already on PATH`;
  }
  if (tool.run === null) {
    return `${tool.bin}: would suggest ${suggestion(tool, ctx)}`;
  }
  if (!ctx.probe(tool.prereq)) {
    return `${tool.bin}: would need ${tool.prereq} first, then ${tool.install}`;
  }
  return `${tool.bin}: would run ${tool.install}`;
}

export function installOne(tool: Tool, ctx: InstallContext): ToolOutcome {
  if (ctx.env[skipKey(tool.bin)] === "1") {
    return { bin: tool.bin, status: "skipped", detail: `${skipKey(tool.bin)}=1` };
  }
  if (ctx.probe(tool.bin)) {
    return { bin: tool.bin, status: "already", detail: "on PATH" };
  }
  if (tool.run === null) {
    return { bin: tool.bin, status: "suggested", detail: `run: ${suggestion(tool, ctx)}` };
  }
  if (!ctx.probe(tool.prereq)) {
    return {
      bin: tool.bin,
      status: "missing-prereq",
      detail: `${tool.prereq} is not on PATH; ${tool.prereqHint}`,
    };
  }
  const [command, ...args] = tool.run;
  if (command === undefined || ctx.run(command, args) !== 0) {
    return { bin: tool.bin, status: "error", detail: `failed: ${tool.install}` };
  }
  if (tool.prereq !== GO_PREREQ) {
    return { bin: tool.bin, status: "installed", detail: tool.install };
  }
  const failure = linkFromGoBin(ctx.env, tool.bin);
  return failure === null
    ? {
        bin: tool.bin,
        status: "installed",
        detail: `${tool.install}, linked into ${binDir(ctx.env)}`,
      }
    : { bin: tool.bin, status: "error", detail: failure };
}

/** Worst first: one error outranks nineteen successes, and a suggestion
 * outranks a clean run because the user still has a line to type. */
const SEVERITY: readonly InstallStatus[] = [
  "error",
  "missing-prereq",
  "suggested",
  "installed",
  "skipped",
  "already",
];

export function worstStatus(outcomes: readonly ToolOutcome[]): InstallStatus {
  return SEVERITY.find((status) => outcomes.some((o) => o.status === status)) ?? "already";
}

/** Every row, in table order, with one tool's trouble kept to that tool. */
export function installAll(ctx: InstallContext, tools: readonly Tool[] = TOOLS): ToolOutcome[] {
  return tools.map((tool) => installOne(tool, ctx));
}
