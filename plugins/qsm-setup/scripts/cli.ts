#!/usr/bin/env bun
// qsm-setup: the marketplace's own installer.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Call,
  flagArg,
  type Handler,
  optionalString,
  requiredString,
  runCli,
  stringList,
} from "../../../lib/cli-base.ts";
import { exitOf, fail, OUTCOME_CODES, type Outcome, ok } from "../../../lib/outcome.ts";
import {
  binDir,
  buildRecordPath,
  type Env,
  fishCompletionDir,
  stateDir,
} from "../../../lib/paths.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import { buildBins } from "../lib/build-bins.ts";
import { readConfig, resolveProfile } from "../lib/config.ts";
import type { PluginNode } from "../lib/discover.ts";
import { readInstalled } from "../lib/doctor.ts";
import { declaredBins, type FarmReport, relink, removeUndeclaredBins } from "../lib/farm.ts";
import { installOrder, requiredBy } from "../lib/graph.ts";
import { parseEnvelope } from "../lib/json.ts";
import { bunRunner, isFailedOutcome, runInstallers } from "../lib/run-installers.ts";
import manifestJson from "../qsm.json" with { type: "json" };
import { handlers as healthHandlers } from "./cli-health.ts";
import { describePurge, purgeMachine, withRoot } from "./root.ts";

const manifest = parseManifest(manifestJson, "qsm-setup/qsm.json");

const env: Env = process.env;

function selectPlugins(call: Call, nodes: readonly PluginNode[]): string[] | undefined | Outcome {
  const names = stringList(call, "plugins");
  const profile = optionalString(call, "profile");
  const modes = [flagArg(call, "all"), names.length > 0, profile !== undefined].filter(
    Boolean,
  ).length;
  if (modes !== 1) {
    return fail("usage", "install takes exactly one of --all, plugin names, or --profile <name>");
  }
  if (flagArg(call, "all")) {
    return undefined;
  }
  if (profile !== undefined) {
    return resolveProfile(
      profile,
      nodes.map((n) => n.name),
      readConfig(env),
    );
  }
  return names;
}

/** The last line of a human install: the usage review, offered or how to get it; none under --json. */
function usageOffer(json: boolean): string[] {
  if (json) {
    return [];
  }
  const installed = readInstalled(join(stateDir(env), "installed.json")).includes("qsm-usage");
  return [
    installed
      ? 'qsm-usage is installed: to review your Claude Code usage, say "review my Claude Code usage"'
      : "qsm-usage is not installed: a usage review session needs it, run `qsm-setup install qsm-usage`",
  ];
}

function rememberInstalled(outcomes: readonly { plugin: string; status: string }[]): void {
  const path = join(stateDir(env), "installed.json");
  const kept = new Set(readInstalled(path));
  for (const o of outcomes) {
    if (o.status === "installed" || o.status === "already" || o.status === "suggested") {
      kept.add(o.plugin);
    }
  }
  mkdirSync(stateDir(env), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ plugins: [...kept].toSorted() }, null, 2)}\n`);
}

/** ok when nothing failed, else failed (all of them) or partial (some). */
function collected<T>(
  outcomes: readonly T[],
  lines: string,
  failed: number,
): Outcome<readonly T[]> {
  if (failed === 0) {
    return ok(outcomes, lines);
  }
  return fail(failed === outcomes.length ? "failed" : "partial", lines, outcomes);
}

const install: Handler = (call) =>
  withRoot(call, (nodes, root) => {
    const selected = selectPlugins(call, nodes);
    if (selected !== undefined && !Array.isArray(selected)) {
      return selected;
    }
    const known = nodes.map((n) => n.name);
    const unknown = (selected ?? []).filter((name) => !known.includes(name));
    if (unknown.length > 0) {
      return fail("usage", `unknown plugin: ${unknown.join(", ")}; known: ${known.join(", ")}`);
    }
    const dryRun = flagArg(call, "dryRun");
    const purged = purgeMachine(nodes, root, dryRun);
    const undeclared = removeUndeclaredBins(new Set(declaredBins(nodes).map((d) => d.bin)), {
      binDir: binDir(env),
      completionDir: fishCompletionDir(env),
      recordPath: buildRecordPath(env),
      check: dryRun,
    });
    const purgeLines = [
      ...describePurge(purged, dryRun),
      ...undeclared.map((b) => `${dryRun ? "would remove" : "removed"} undeclared binary ${b}`),
    ];
    const order = installOrder(nodes, selected);
    const outcomes = runInstallers(nodes, order, {
      dryRun,
      run: bunRunner,
      requiredBy: requiredBy(nodes, order, selected),
    });
    if (!dryRun) {
      rememberInstalled(outcomes);
    }
    const left = dryRun ? purged : purgeMachine(nodes, root, true);
    const lines = [
      ...purgeLines,
      ...(purgeLines.length === 0 ? ["purge: nothing older to remove"] : []),
      ...describePurge(left, true).map((l) => `left behind, ${l}`),
      ...outcomes.map((o) => `${o.plugin}: ${o.status}: ${o.detail}`),
      ...usageOffer(call.json),
    ].join("\n");
    const failed = outcomes.filter(isFailedOutcome).length;
    const leftBehind = !dryRun && left.found.length + left.blocked.length > 0;
    return collected(outcomes, lines, failed + (leftBehind ? 1 : 0));
  });

/** The activation owns the terminal so it can ask; it prints its own report, the exit is the code. */
function activateAtTerminal(argv: string[]): Outcome {
  const { status } = spawnSync("bun", argv, { stdio: "inherit" });
  if (status === 0) {
    return ok();
  }
  const code = OUTCOME_CODES.find((c) => c !== "partial" && exitOf(c) === status);
  return fail(code === undefined || code === "ok" ? "failed" : code, `activation exited ${status}`);
}

/** The activation's own envelope, passed on: its code is the verb's code. */
const activateVerb: Handler = (call) =>
  withRoot(call, (nodes) => {
    const name = requiredString(call, "plugin");
    const node = nodes.find((n) => n.name === name);
    if (node === undefined) {
      return fail(
        "usage",
        `unknown plugin: ${name}; known: ${nodes.map((n) => n.name).join(", ")}`,
      );
    }
    if (node.activation === null) {
      return fail("missing", `${name} has no activation: nothing to activate`);
    }
    const flags = [...(flagArg(call, "dryRun") ? ["--dry-run"] : []), ...call.rest];
    if (!call.noInput && process.stdin.isTTY) {
      return activateAtTerminal([node.activation, ...flags]);
    }
    const argv = [node.activation, "--json", ...flags];
    const r = spawnSync("bun", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const envelope = parseEnvelope(r.stdout);
    if (envelope !== null) {
      return { code: envelope.code, message: envelope.message, data: envelope.data };
    }
    const last = (r.stderr ?? "").trim().split("\n").at(-1) ?? "";
    return fail(
      "failed",
      `${name}'s activation exited ${r.status} and printed no envelope: ${last}`,
    );
  });

function describeFarm(r: FarmReport): string[] {
  const lines: string[] = [];
  if (r.missingBins.length > 0) {
    lines.push(`missing binaries (run qsm-setup build-bins): ${r.missingBins.join(", ")}`);
  }
  if (r.wroteCompletions.length > 0) {
    lines.push(`completions: ${r.wroteCompletions.join(", ")}`);
  }
  if (r.prunedCompletions.length > 0) {
    lines.push(`pruned completions: ${r.prunedCompletions.join(", ")}`);
  }
  if (r.removedBins.length > 0) {
    lines.push(`removed undeclared binaries: ${r.removedBins.join(", ")}`);
  }
  return lines;
}

function relinkMachine(nodes: readonly PluginNode[], root: string, check: boolean): Outcome {
  const opts = {
    binDir: binDir(env),
    completionDir: fishCompletionDir(env),
    recordPath: buildRecordPath(env),
  };
  const before = relink(nodes, { ...opts, check: true });
  const older = purgeMachine(nodes, root, true);
  const stale = before.stale || older.found.length + older.blocked.length > 0;
  if (check) {
    const lines = [
      stale ? "farm stale" : "farm current",
      ...describeFarm(before),
      ...describePurge(older, true),
    ].join("\n");
    return stale ? fail("failed", lines, { ...before, older }) : ok(before, lines);
  }
  const purged = stale ? purgeMachine(nodes, root, false) : older;
  const report = before.stale ? relink(nodes, { ...opts, check: false }) : before;
  const lines = [
    stale ? "relinked" : "farm current",
    ...describeFarm(report),
    ...describePurge(purged, false),
  ].join("\n");
  const data = { ...report, purged, relinked: stale };
  if (purged.blocked.length > 0) {
    return fail("failed", lines, data);
  }
  return report.missingBins.length > 0 ? fail("missing", lines, data) : ok(data, lines);
}

const relinkVerb: Handler = (call) => {
  if (flagArg(call, "auto") && readConfig(env).autoRelink !== true) {
    return ok(
      { relinked: false, reason: "not opted in" },
      "relink: this machine has not opted in (setup.json autoRelink)",
    );
  }
  return withRoot(call, (nodes, root) => relinkMachine(nodes, root, flagArg(call, "check")), true);
};

const buildBinsVerb: Handler = (call) =>
  withRoot(call, (nodes) => {
    const outcomes = buildBins(nodes, {
      binDir: binDir(env),
      recordPath: buildRecordPath(env),
      run: bunRunner,
    });
    const lines = outcomes.map((o) => `${o.plugin}/${o.bin}: ${o.status}: ${o.detail}`).join("\n");
    const failed = outcomes.filter((o) => o.status === "failed").length;
    return collected(outcomes, lines, failed);
  });

if (import.meta.main) {
  process.exit(
    await runCli(manifest, "qsm-setup", {
      install,
      activate: activateVerb,
      relink: relinkVerb,
      "build-bins": buildBinsVerb,
      ...healthHandlers,
    }),
  );
}
