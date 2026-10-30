#!/usr/bin/env bun
// What the person made is never deleted by a tool. Claude Code deletes its transcripts after
// `cleanupPeriodDays`, so the one value qsm may write there is 36500 or more: a 7 this marketplace
// once wrote deleted two weeks of transcripts the next day. Every assignment of cleanupPeriodDays
// to a lower number in a plugin's code or JSON is a finding; a test may set one to prove it is
// raised, and prose may name Claude Code's default.
import { readFileSync } from "node:fs";
import { pluginsDir, rel, report, walk } from "./walk.ts";

export const KEEP_DAYS = 36500;
// A JSON key, an object key (no space before the colon, which a ternary has), or an assignment.
const SETTING =
  /(?:"cleanupPeriodDays"\s*:|\bcleanupPeriodDays(?::|\s*=(?!=)))\s*(\d+|\$\{[A-Za-z_]\w*\}|[A-Za-z_]\w*)/g;

/** The number a name stands for in `src` (`const NAME = 7`), or null when the file does not say. */
function constantIn(src: string, name: string): number | null {
  const m = src.match(new RegExp(`\\bconst ${name}\\s*=\\s*(\\d+)`));
  return m?.[1] === undefined ? null : Number(m[1]);
}

/** The lines of `src` that give cleanupPeriodDays a value this gate cannot prove is KEEP_DAYS or
 * more: a lower literal, a name the file defines below it, or any name but KEEP_DAYS that the
 * file does not define (a 7 once reached settings.json through a constant). */
export function deletingLines(src: string): number[] {
  const lines: number[] = [];
  for (const m of src.matchAll(SETTING)) {
    const value = (m[1] ?? "").replaceAll(/^\$\{|\}$/g, "");
    const days = /^\d+$/.test(value) ? Number(value) : constantIn(src, value);
    const proven = days === null ? value === "KEEP_DAYS" : days >= KEEP_DAYS;
    if (!proven) {
      lines.push(src.slice(0, m.index).split("\n").length);
    }
  }
  return lines;
}

if (import.meta.main) {
  const findings: string[] = [];
  for (const file of walk(pluginsDir)) {
    if (!/\.(tsx?|json)$/.test(file) || /\.test\.tsx?$|\/node_modules\//.test(file)) {
      continue;
    }
    for (const line of deletingLines(readFileSync(file, "utf8"))) {
      findings.push(
        `${rel(file)}:${line}: cleanupPeriodDays is set below ${KEEP_DAYS}, or through a name this gate cannot read: write KEEP_DAYS`,
      );
    }
  }
  report("no-data-deletion", findings);
}
