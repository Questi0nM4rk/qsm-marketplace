// How long each checker took at each point: a run over its point's target is reported slow, and the
// last runs are kept under `.qsm-langdev/timings/<point>.jsonl` so doctor can name a checker that is
// slow every time.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../../../lib/fs.ts";
import { cacheDir } from "./cache-dir.ts";
import { num, recordOf, str } from "./json.ts";
import { type Point, POINTS } from "./registry.ts";

/** Runs kept per checker and point: enough for a median, and the file stays bounded. */
const KEPT_RUNS = 10;

/** One checker's run that scored at least one side; a store hit is not a run. */
export interface Timing {
  checker: string;
  ms: number;
}

/** A kept run: a timing and when it ran (ISO 8601). */
interface Kept extends Timing {
  at: string;
}

const seconds = (ms: number): string => (ms / 1000).toFixed(1);

/** The report line for each run over the point's target. */
export function slowLines(
  point: Point,
  timings: readonly Timing[],
  targetMs: number = POINTS[point].targetMs,
): string[] {
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
export function readTimings(root: string, point: Point): Kept[] {
  const path = timingsPath(root, point);
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .flatMap((line) => {
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

/** Adds this run's timings at `point`, keeping the last KEPT_RUNS of each checker. */
export function recordTimings(root: string, point: Point, timings: readonly Timing[]): void {
  if (timings.length === 0) {
    return;
  }
  const at = new Date().toISOString();
  const all = [...readTimings(root, point), ...timings.map((timing) => ({ ...timing, at }))];
  const kept = all.filter(
    (timing, index) =>
      all.slice(index + 1).filter((later) => later.checker === timing.checker).length < KEPT_RUNS,
  );
  cacheDir(root, "timings");
  const lines = kept.map(({ checker, ms, at: ran }) =>
    JSON.stringify({ checker, ms: Math.round(ms), at: ran }),
  );
  writeAtomic(timingsPath(root, point), `${lines.join("\n")}\n`);
}
