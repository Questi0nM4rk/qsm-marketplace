// How long each checker took at each point: a run over its point's target is reported slow, and the
// last runs are kept under `.qsm-langdev/timings/<point>.jsonl` so doctor can name a checker that is
// slow every time.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../../../lib/fs.ts";
import { messageOf } from "../../../lib/outcome.ts";
import { cacheDir } from "./cache-dir.ts";
import { isErrno } from "./errors.ts";
import { num, recordOf, str } from "./json.ts";
import { type Point, POINT_NAMES, POINTS } from "./registry.ts";

/** Runs kept per checker and point: enough for a median, and the file stays bounded. */
const KEPT_RUNS = 10;

/** One checker's run that scored at least one side; a store hit is not a run. */
export interface Timing {
  checker: string;
  ms: number;
}

/** A kept run: a timing and when it ran (ISO 8601), for the person reading the file. */
interface Kept extends Timing {
  at: string;
}

const seconds = (ms: number): string => (ms / 1000).toFixed(1);

/** The report line for each run over `targetMs`. */
function slowLines(point: Point, timings: readonly Timing[], targetMs: number): string[] {
  return timings
    .filter(({ ms }) => ms > targetMs)
    .map(
      ({ checker, ms }) =>
        `slow: ${checker} ${seconds(ms)} s at ${point}, target ${seconds(targetMs)} s`,
    );
}

function timingsPath(root: string, point: Point): string {
  return join(root, ".qsm-langdev", "timings", `${point}.jsonl`);
}

/** Every kept run at `point`, oldest first; a line that is not a timing is no run. */
function readTimings(root: string, point: Point): Kept[] {
  let text: string;
  try {
    text = readFileSync(timingsPath(root, point), "utf8");
  } catch (cause) {
    if (isErrno(cause) && cause.code === "ENOENT") {
      return [];
    }
    throw cause;
  }
  return text.split("\n").flatMap((line) => {
    if (line === "") {
      return [];
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return [];
    }
    const record = recordOf(value);
    const ms = num(record?.ms);
    return record === null || ms === undefined
      ? []
      : [{ checker: str(record.checker), ms, at: str(record.at) }];
  });
}

/** Each checker's runs, oldest first. */
function byChecker(runs: readonly Kept[]): Map<string, Kept[]> {
  const groups = new Map<string, Kept[]>();
  for (const run of runs) {
    groups.set(run.checker, [...(groups.get(run.checker) ?? []), run]);
  }
  return groups;
}

/** Adds this run's timings at `point`, keeping the last KEPT_RUNS of each checker. */
function recordTimings(root: string, point: Point, timings: readonly Timing[]): void {
  if (timings.length === 0) {
    return;
  }
  const at = new Date().toISOString();
  const all = [...readTimings(root, point), ...timings.map((timing) => ({ ...timing, at }))];
  const kept = [...byChecker(all).values()].flatMap((runs) => runs.slice(-KEPT_RUNS));
  cacheDir(root, "timings");
  const lines = kept.map(({ checker, ms, at: ran }) =>
    JSON.stringify({ checker, ms: Math.round(ms), at: ran }),
  );
  writeAtomic(timingsPath(root, point), `${lines.join("\n")}\n`);
}

/** Records `timed` at `point` and gives the run's lines: each run over `targetMs`, and a record that
 * could not be written, which never costs a verdict. */
export function recordRun(
  root: string,
  point: Point,
  timed: readonly Timing[],
  targetMs: number,
): string[] {
  const lines = slowLines(point, timed, targetMs);
  try {
    recordTimings(root, point, timed);
  } catch (cause) {
    lines.push(`timings not recorded: ${messageOf(cause)}`);
  }
  return lines;
}

function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** One line per checker whose median over its kept runs at a point is above that point's target. */
export function slowCheckers(root: string): string[] {
  return POINT_NAMES.flatMap((point) => {
    const { targetMs } = POINTS[point];
    return [...byChecker(readTimings(root, point))].flatMap(([checker, runs]) => {
      const ms = median(runs.map((run) => run.ms));
      return ms > targetMs
        ? [
            `${checker} is slow at ${point}: median ${seconds(ms)} s over ${runs.length} runs, target ${seconds(targetMs)} s`,
          ]
        : [];
    });
  });
}
