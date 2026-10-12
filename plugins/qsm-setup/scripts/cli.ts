#!/usr/bin/env bun
// qsm-setup: the marketplace's own installer.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Call, type Handler, runCli } from "../../../lib/cli-base.ts";
import {
  type Envelope,
  exitOf,
  fail,
  OUTCOME_CODES,
  type Outcome,
  ok,
} from "../../../lib/outcome.ts";
import {
  binDir,
  buildRecordPath,
  type Env,
  fishCompletionDir,
  stateDir,
} from "../../../lib/paths.ts";
import type { QsmManifest } from "../../../lib/qsm-manifest.ts";
import { buildBins } from "../lib/build-bins.ts";
import { type ClaudeProbes, claudeChecks, type Lookup } from "../lib/claude-health.ts";
import { readConfig, resolveProfile } from "../lib/config.ts";
import { discoverPlugins, type PluginNode } from "../lib/discover.ts";
import { doctor, type Probe, qsmBinsIn, readInstalled } from "../lib/doctor.ts";
import { declaredBins, type FarmReport, relink, removeUndeclaredBins } from "../lib/farm.ts";
import { installOrder, requiredBy } from "../lib/graph.ts";
import { type PurgeReport, purge } from "../lib/purge.ts";
import {
  bunActivationReader,
  bunRunner,
  isFailedOutcome,
  runInstallers,
} from "../lib/run-installers.ts";
import { compareTools, describeTools, type ToolsProbes } from "../lib/tools.ts";
import manifestJson from "../qsm.json" with { type: "json" };

const manifest = manifestJson as QsmManifest;
const env: Env = process.env;

/** The checkout every verb works on, or why there is none. A root that holds no plugin is a wrong
 * root, except for `relink`, which prunes the bins of plugins that are gone. */
function withRoot<T extends Outcome | Promise<Outcome>>(
  call: Call,
  verb: (nodes: readonly PluginNode[], root: string) => T,
  allowEmpty = false,
): T | Outcome {
  const root =
    (call.args.root as string | undefined) ??
    env.QSM_MARKETPLACE ??
    readConfig(env).marketplaceRoot;
  if (root === undefined) {
    return fail(
      "missing",
      "no marketplace root: pass --root, set QSM_MARKETPLACE, or write marketplaceRoot into setup.json",
    );
  }
  const nodes = discoverPlugins(root);
  return nodes.length === 0 && !allowEmpty
    ? fail("missing", `${root} holds no plugins`)
    : verb(nodes, root);
}

/** The probe sees the bin directory install writes to, whether or not the
 * user's PATH has it yet. */
const shellProbe: Probe = (shell) => {
  const r = spawnSync("sh", ["-c", shell], {
    encoding: "utf8",
    env: { ...env, PATH: `${binDir(env)}:${env.PATH ?? ""}` },
  });
  return { code: r.status ?? 1, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};

const RELEASES = "https://downloads.claude.ai/claude-code-releases";

/** One GET, five seconds, no retry: the body is the version as plain text. */
const lookupLatest: ClaudeProbes["latest"] = (channel) =>
  fetch(`${RELEASES}/${channel}`, { signal: AbortSignal.timeout(5000) })
    .then(
      async (res): Promise<Lookup> =>
        res.ok
          ? { ok: true, version: (await res.text()).trim() }
          : { ok: false, reason: `HTTP ${res.status}` },
    )
    .catch((e: unknown): Lookup => ({ ok: false, reason: String(e) }));

function whichClaude(): string[] {
  const r = spawnSync("which", ["-a", "claude"], { encoding: "utf8" });
  return (r.stdout ?? "").split("\n").filter((l) => l.length > 0);
}

function claudeVersion(): string | null {
  const r = spawnSync("claude", ["--version"], { encoding: "utf8", timeout: 10_000 });
  return r.status === 0 ? r.stdout : null;
}

const claudeProbes: ClaudeProbes = {
  env,
  cwd: process.cwd(),
  whichAll: whichClaude,
  version: claudeVersion,
  latest: lookupLatest,
};

function selectPlugins(call: Call, nodes: readonly PluginNode[]): string[] | undefined | Outcome {
  const names = (call.args.plugins as string[] | undefined) ?? [];
  const profile = call.args.profile as string | undefined;
  const modes = [call.args.all === true, names.length > 0, profile !== undefined].filter(
    Boolean,
  ).length;
  if (modes !== 1) {
    return fail("usage", "install takes exactly one of --all, plugin names, or --profile <name>");
  }
  if (call.args.all === true) {
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
  writeFileSync(path, `${JSON.stringify({ plugins: [...kept].sort() }, null, 2)}\n`);
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

/** What an older qsm left on this machine, as `purge` finds it; `check` only reports. */
function purgeMachine(nodes: readonly PluginNode[], dir: string, check: boolean): PurgeReport {
  const root = resolve(dir);
  const marketplace = join(root, ".claude-plugin", "marketplace.json");
  const name = existsSync(marketplace)
    ? (JSON.parse(readFileSync(marketplace, "utf8")) as { name: string }).name
    : "qsm-marketplace";
  return purge({
    env,
    root,
    marketplace: name,
    plugins: new Set(nodes.map((n) => n.name)),
    check,
  });
}

function describePurge(r: PurgeReport, check: boolean): string[] {
  const verb = check ? "would remove" : "removed";
  return [...r.found.map((f) => `${verb} ${f}`), ...r.blocked.map((b) => `blocked: ${b}`)];
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
    const dryRun = call.args.dryRun === true;
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
    const name = call.args.plugin as string;
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
    const flags = [...(call.args.dryRun === true ? ["--dry-run"] : []), ...call.rest];
    if (!call.noInput && process.stdin.isTTY) {
      return activateAtTerminal([node.activation, ...flags]);
    }
    const argv = [node.activation, "--json", ...flags];
    const r = spawnSync("bun", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    try {
      const envelope = JSON.parse(r.stdout) as Envelope;
      return { code: envelope.code, message: envelope.message, data: envelope.data };
    } catch {
      const last = (r.stderr ?? "").trim().split("\n").at(-1) ?? "";
      return fail(
        "failed",
        `${name}'s activation exited ${r.status} and printed no envelope: ${last}`,
      );
    }
  });

const doctorVerb: Handler = (call) =>
  withRoot(call, async (nodes, root) => {
    const only = (call.args.plugin as string | undefined) ?? null;
    const claude = only === null ? await claudeChecks(claudeProbes) : [];
    const verbose = call.args.verbose === true;
    const report = doctor(nodes, {
      installedPath: join(stateDir(env), "installed.json"),
      recordPath: buildRecordPath(env),
      binDir: binDir(env),
      path: env.PATH ?? "",
      only,
      probe: shellProbe,
      run: bunRunner,
      activation: bunActivationReader,
      legacy: purgeMachine(nodes, root, true),
      claude,
    });
    const lines = report.checks.flatMap((c) => {
      const head = `${c.status} ${c.name}: ${c.detail}`;
      const show = c.output.length > 0 && (c.status === "FAIL" || verbose);
      return show
        ? [
            head,
            ...c.output
              .trimEnd()
              .split("\n")
              .map((l) => `  ${l}`),
          ]
        : [head];
    });
    if (only === null) {
      lines.push(`${report.pass} pass, ${report.fail} fail, ${report.skip} skip`);
    }
    return report.ok ? ok(report, lines.join("\n")) : fail("failed", lines.join("\n"), report);
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
  if (call.args.auto === true && readConfig(env).autoRelink !== true) {
    return ok(
      { relinked: false, reason: "not opted in" },
      "relink: this machine has not opted in (setup.json autoRelink)",
    );
  }
  return withRoot(
    call,
    (nodes, root) => relinkMachine(nodes, root, call.args.check === true),
    true,
  );
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

/** Every qsm-* executable in a PATH directory or the qsm bin directory. */
function installedQsmBins(): Set<string> {
  return new Set(qsmBinsIn([...(env.PATH ?? "").split(":"), binDir(env)]).keys());
}

function toolsProbes(root: string): ToolsProbes {
  return {
    git: (args) => {
      const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
      return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    },
    installed: installedQsmBins,
    mtime: (path) => {
      try {
        return statSync(path).mtime;
      } catch {
        return null;
      }
    },
  };
}

const toolsVerb: Handler = (call) =>
  withRoot(call, (nodes, root) => {
    const r = compareTools(nodes, toolsProbes(root), call.args.fetch === true);
    if (r.kind !== "ok") {
      return fail(r.kind, r.message);
    }
    const out = ok(r.report, describeTools(r.report).join("\n"));
    const onMain = r.report.binaries.some((b) => !b.goneFromMain);
    return onMain
      ? out
      : { ...out, warnings: ["origin/main declares no qsm binaries under plugins/*/qsm.json"] };
  });

if (import.meta.main) {
  process.exit(
    await runCli(manifest, "qsm-setup", {
      install,
      activate: activateVerb,
      doctor: doctorVerb,
      relink: relinkVerb,
      "build-bins": buildBinsVerb,
      tools: toolsVerb,
    }),
  );
}
