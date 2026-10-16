// Doctor: each installed plugin's own probe, each activation's state, the orphans the marketplace no
// longer lists, whether the built binaries still match the record and are the
// ones PATH finds, qsm binaries no plugin declares, and the Claude Code group
// (claude-health.ts) the caller ran beforehand.
import {
  accessSync,
  constants,
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { readRecord, sha256 } from "../../../lib/install-base.ts";
import type { PluginNode } from "./discover.ts";
import { declaredBins } from "./farm.ts";
import { isRecord } from "../../../lib/outcome.ts";
import type { PurgeReport } from "./purge.ts";
import type { ActivationReader, Runner } from "./run-installers.ts";

type CheckStatus = "PASS" | "FAIL" | "SKIP" | "WARN";
export interface Check {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
  readonly output: string;
}
export interface DoctorReport {
  readonly checks: readonly Check[];
  readonly pass: number;
  readonly fail: number;
  readonly skip: number;
  readonly ok: boolean;
}
export type Probe = (shell: string) => { readonly code: number; readonly output: string };

export function readInstalled(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(parsed) && Array.isArray(parsed.plugins)
      ? parsed.plugins.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function probeFor(node: PluginNode): string | null {
  if (node.doctor !== null) {
    return node.doctor;
  }
  const [firstBin] = Object.keys(node.bins);
  // stdout is dropped, stderr kept: a failing probe then says why
  return firstBin === undefined
    ? null
    : `command -v ${firstBin} >/dev/null || { echo "${firstBin} is not on PATH" >&2; exit 1; }; ${firstBin} doctor >/dev/null`;
}

export interface DoctorOptions {
  readonly installedPath: string;
  readonly recordPath: string;
  readonly binDir: string;
  /** the PATH the user's shell resolves binaries through */
  readonly path?: string;
  readonly only: string | null;
  readonly probe: Probe;
  /** runs an installer, to ask a plugin with no probe of its own which upstream tools it needs */
  readonly run: Runner;
  /** reads an activation's state; without it no activation is checked */
  readonly activation?: ActivationReader;
  /** what an older qsm left on the machine (purge in check mode); without it nothing is checked */
  readonly legacy?: PurgeReport;
  /** the Claude Code group, reported after the drift check on a full run */
  readonly claude?: readonly Check[];
}

/** A plugin with no probe is healthy when the upstream tools its installer declares are there;
 * the installer's own dry run says which are missing and what fixes each. */
function upstreamCheck(name: string, node: PluginNode, run: Runner): Check {
  const steps = node.installer === null ? [] : (run(node.installer, true).result?.steps ?? []);
  const tools = steps.filter((s) => s.name.startsWith("upstream "));
  if (tools.length === 0) {
    return { name, status: "SKIP", detail: "declares no probe", output: "" };
  }
  const missing = tools.filter((s) => s.status !== "already");
  if (missing.length === 0) {
    const cmds = tools.map((s) => s.name.slice("upstream ".length)).join(", ");
    return { name, status: "PASS", detail: `upstream tools on PATH: ${cmds}`, output: "" };
  }
  const required = missing.some((s) => s.status === "missing-prereq");
  const detail = missing.map((s) => `${s.name}: ${s.detail}`).join("; ");
  return { name, status: required ? "FAIL" : "WARN", detail, output: "" };
}

function pluginCheck(name: string, node: PluginNode | undefined, opts: DoctorOptions): Check {
  if (node === undefined) {
    // The record is ours, not Claude Code's: the remedy edits the record.
    return {
      name,
      status: "WARN",
      detail: `orphan: recorded as installed, not in the marketplace; drop "${name}" from ${opts.installedPath}`,
      output: "",
    };
  }
  const shell = probeFor(node);
  if (shell === null) {
    return upstreamCheck(name, node, opts.run);
  }
  const r = opts.probe(shell);
  return r.code === 0
    ? { name, status: "PASS", detail: "probe passed", output: r.output }
    : { name, status: "FAIL", detail: `probe exited ${r.code}`, output: r.output };
}

/** An activation is optional: a machine works without it, so absent and differs warn. */
function activationCheck(node: PluginNode, read: ActivationReader): Check {
  const name = `${node.name} activation`;
  const report = node.activation === null ? "no activation" : read(node.activation);
  if (typeof report === "string") {
    return { name, status: "FAIL", detail: report, output: "" };
  }
  const options = report.options.map((o) => `--${o.name} <${o.values.join("|")}>`).join(" ");
  const run = `qsm-setup activate ${node.name}`;
  const states = {
    activated: { status: "PASS", detail: "activated and current" },
    absent: { status: "WARN", detail: `not activated: run ${run} -- ${options}` },
    differs: { status: "WARN", detail: `differs: run ${run}` },
  } as const;
  return { name, output: "", ...states[report.state] };
}

function driftCheck(recordPath: string, binDir: string): Check {
  const record = readRecord(recordPath);
  if (record === null) {
    return {
      name: "binaries",
      status: "SKIP",
      detail: "no build has run yet; run: qsm-setup build-bins",
      output: "",
    };
  }
  const drifted = Object.entries(record.bins)
    .filter(([bin, entry]) => {
      const path = join(binDir, bin);
      return !existsSync(path) || sha256(path) !== entry.sha256;
    })
    .map(([bin]) => bin);
  if (drifted.length === 0) {
    const n = Object.keys(record.bins).length;
    return {
      name: "binaries",
      status: "PASS",
      detail: `${n} built binaries match the record`,
      output: "",
    };
  }
  return {
    name: "binaries",
    status: "FAIL",
    detail: `drifted or missing: ${drifted.join(", ")}; run: qsm-setup build-bins && qsm-setup relink`,
    output: "",
  };
}

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Every qsm-* executable in the directories, first hit per name first. */
export function qsmBinsIn(dirs: readonly string[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const dir of dirs.filter((d) => d !== "")) {
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names.filter((n) => n.startsWith("qsm-"))) {
      const full = join(dir, name);
      if (isExecutableFile(full)) {
        found.set(name, [...(found.get(name) ?? []), full]);
      }
    }
  }
  return found;
}

function same(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

/** A built binary is only usable by name when PATH finds that very file. */
function legacyCheck(legacy: PurgeReport): Check {
  const left = [...legacy.found, ...legacy.blocked];
  return left.length === 0
    ? { name: "legacy", status: "PASS", detail: "no artifact of an older qsm", output: "" }
    : {
        name: "legacy",
        status: "FAIL",
        detail: `older qsm left: ${left.join("; ")}; run: qsm-setup relink`,
        output: "",
      };
}

function pathChecks(
  nodes: readonly PluginNode[],
  recordPath: string,
  opts: DoctorOptions,
): Check[] {
  if (opts.path === undefined) {
    return [];
  }
  const pathBins = qsmBinsIn(opts.path.split(":"));
  const record = readRecord(recordPath);
  const everyBin = new Set([
    ...declaredBins(nodes).map((b) => b.bin),
    ...Object.keys(record?.bins ?? {}),
  ]);
  const shadowed = [...everyBin].flatMap((bin) => {
    const first = pathBins.get(bin)?.[0];
    const ours = join(opts.binDir, bin);
    return first === undefined || same(first, ours)
      ? []
      : [`${bin} resolves to ${first}, not ${ours}; remove it or put ${opts.binDir} first on PATH`];
  });
  const stray = [...pathBins].filter(([name]) => !everyBin.has(name)).flatMap(([, paths]) => paths);
  return [
    shadowed.length === 0
      ? {
          name: "path",
          status: "PASS",
          detail: "every built binary is the one PATH finds",
          output: "",
        }
      : { name: "path", status: "FAIL", detail: shadowed.join("; "), output: "" },
    ...(stray.length === 0
      ? []
      : [
          {
            name: "stray binaries",
            status: "WARN" as const,
            detail: `no plugin declares ${stray.join(", ")}`,
            output: "",
          },
        ]),
  ];
}

export function doctor(nodes: readonly PluginNode[], opts: DoctorOptions): DoctorReport {
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const targets = opts.only === null ? readInstalled(opts.installedPath) : [opts.only];
  const checks = targets.map((name) => pluginCheck(name, byName.get(name), opts));
  const read = opts.activation;
  for (const node of targets.map((t) => byName.get(t))) {
    if (read !== undefined && typeof node?.activation === "string") {
      checks.push(activationCheck(node, read));
    }
  }
  if (opts.only === null) {
    checks.push(
      driftCheck(opts.recordPath, opts.binDir),
      ...pathChecks(nodes, opts.recordPath, opts),
      ...(opts.legacy === undefined ? [] : [legacyCheck(opts.legacy)]),
      ...(opts.claude ?? []),
    );
  }
  const count = (s: CheckStatus): number => checks.filter((c) => c.status === s).length;
  return {
    checks,
    pass: count("PASS"),
    fail: count("FAIL"),
    skip: count("SKIP"),
    ok: count("FAIL") === 0,
  };
}
