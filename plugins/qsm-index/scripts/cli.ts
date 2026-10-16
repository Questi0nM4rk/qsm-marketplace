#!/usr/bin/env bun

// qsm-index: `build`, `auto`, `edited`, `doctor`, `mcp serve`, and every tool of the MCP server as
// a verb.

import {
  type Call,
  type Handler,
  optionalString,
  requiredString,
  runCli,
} from "../../../lib/cli-base.ts";
import { fail, type Outcome, ok } from "../../../lib/outcome.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import { askText, auto } from "../lib/auto.ts";
import { buildIndex } from "../lib/build.ts";
import { doctor, formatReport } from "../lib/doctor.ts";
import { spawnRunner } from "../lib/run.ts";
import { edited, TOOLS, type ToolOutcome } from "../lib/tools.ts";
import manifestJson from "../qsm.json" with { type: "json" };
import { handlers as mcpHandlers } from "./mcp.ts";

const manifest = parseManifest(manifestJson, "qsm-index/qsm.json");

function build(call: Call): Outcome {
  const path = requiredString(call, "path");
  const report = buildIndex(path, { cwd: process.cwd(), run: spawnRunner, env: process.env });
  if (report.kind === "running") {
    return ok(report, `a build of ${report.repo} is already running since ${report.started_at}`);
  }
  if (report.result === "failed") {
    return fail("failed", `build of ${report.repo} failed: ${report.cause}`, report);
  }
  const text = `graph: ${report.graph_path}\ncommit: ${report.built_at_commit ?? "none"}`;
  return report.result === "partial"
    ? { ...ok(report, text), warnings: [`semantic pass failed: ${report.cause}`] }
    : ok(report, text);
}

/** The session-start decision; every answer but a failed start is a decision, exit 0. */
function runAuto(call: Call): Outcome {
  const path = requiredString(call, "path");
  const given = optionalString(call, "consent");
  const consent = given === "yes" || given === "no" ? given : undefined;
  const answer = auto({ path, consent }, spawnRunner, process.env);
  if (answer.answer === "ask") {
    const text = askText(answer);
    return ok({ ...answer, askText: text }, text);
  }
  if (answer.answer === "failed") {
    return fail("failed", `qsm-index could not start a background build: ${answer.reason}`, answer);
  }
  return ok(answer, "reason" in answer ? answer.reason : `${answer.answer}: ${answer.repo}`);
}

/** One edited file counted towards a refresh; a refresh that cannot start is the one failure. */
function runEdited(call: Call): Outcome {
  const cwd = optionalString(call, "cwd");
  const path = requiredString(call, "path");
  return printed(edited({ path, cwd }, spawnRunner, process.env));
}

/** Unhealthy is a prerequisite that is not there: a binary is off PATH or
 * does not answer. The two external tools never decide the verdict. */
function runDoctor(): Outcome {
  const report = doctor(spawnRunner);
  const text = formatReport(report);
  return report.healthy ? ok(report, text) : fail("missing", text, report);
}

function printed(outcome: ToolOutcome): Outcome {
  return outcome.ok ? ok(outcome.text, outcome.text) : fail("failed", outcome.text);
}

/** The same function the MCP tool of that name calls, its answer printed. */
const toolHandlers: Record<string, Handler> = Object.fromEntries(
  Object.entries(TOOLS).map(([name, tool]) => [
    name,
    (call: Call) => printed(tool(call.args, spawnRunner, process.env)),
  ]),
);

if (import.meta.main) {
  process.exit(
    await runCli(manifest, "qsm-index", {
      build,
      auto: runAuto,
      edited: runEdited,
      doctor: runDoctor,
      ...toolHandlers,
      ...mcpHandlers,
    }),
  );
}
