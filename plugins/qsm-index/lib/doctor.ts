// Health is one question: can a session use this plugin right now?

import type { Runner } from "./run.ts";

const INDEX_BIN = "qsm-index";
export const SEMBLE = {
  bin: "semble",
  provides: "the semantic cache",
  install: "uv tool install semble",
} as const;

/** `graphify affected` keeps the direction of an edge from 0.8.34 on; before that it answers
 * with callees as often as with callers. */
export const GRAPHIFY = {
  bin: "graphify",
  minVersion: "0.8.34",
  install: "uv tool install -U graphifyy",
} as const;

interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface DoctorReport {
  readonly healthy: boolean;
  readonly required: readonly Check[];
  readonly optional: readonly Check[];
}

/** A binary that is there and answers `--help` without failing. */
function helpAnswers(bin: string, run: Runner): Check {
  const answered = run(bin, ["--help"]);
  if (answered.ok) {
    return { name: bin, ok: true, detail: "on PATH, answers --help" };
  }
  return { name: bin, ok: false, detail: answered.detail };
}

/** The numbers of a version text such as `graphify 0.9.76`, or null when it has none. */
function versionOf(text: string): number[] | null {
  const found = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  return found === null ? null : found.slice(1).map(Number);
}

/** True when the version text names `GRAPHIFY.minVersion` or newer. */
export function graphifyNewEnough(text: string): boolean {
  const have = versionOf(text);
  const want = versionOf(GRAPHIFY.minVersion);
  if (have === null || want === null) {
    return false;
  }
  const at = have.findIndex((n, i) => n !== want[i]);
  return at === -1 || (have[at] ?? 0) > (want[at] ?? 0);
}

function graphifyCheck(run: Runner): Check {
  const name = GRAPHIFY.bin;
  const answered = run(name, ["--version"]);
  if (!answered.ok) {
    return { name, ok: false, detail: `missing; install with: ${GRAPHIFY.install}` };
  }
  const version = answered.stdout.trim();
  return graphifyNewEnough(version)
    ? { name, ok: true, detail: `${version}, provides the structural graph` }
    : {
        name,
        ok: false,
        detail: `${version || "no version"} is older than ${GRAPHIFY.minVersion}, whose affected loses edge direction; upgrade with: ${GRAPHIFY.install}`,
      };
}

export function doctor(run: Runner): DoctorReport {
  const required = [helpAnswers(INDEX_BIN, run), graphifyCheck(run)];
  const optional = [SEMBLE].map((external): Check => {
    const answered = run(external.bin, ["--help"]);
    return {
      name: external.bin,
      ok: answered.ok,
      detail: answered.ok
        ? `on PATH, provides ${external.provides}`
        : `missing; install with: ${external.install}`,
    };
  });
  return { healthy: required.every((check) => check.ok), required, optional };
}

/** The human rendering: verdict first, then a line per check. */
export function formatReport(report: DoctorReport): string {
  const lines = [report.healthy ? "healthy" : "unhealthy"];
  for (const check of [...report.required, ...report.optional]) {
    lines.push(`  ${check.ok ? "ok  " : "not "} ${check.name}: ${check.detail}`);
  }
  return lines.join("\n");
}
