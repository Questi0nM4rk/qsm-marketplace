#!/usr/bin/env bun
// What the person made is never deleted by a tool. Claude Code deletes its transcripts after
// `cleanupPeriodDays`, so the one value qsm may write there is 36500 or more: a 7 this marketplace
// once wrote deleted two weeks of transcripts the next day. Every assignment of cleanupPeriodDays
// to a lower number in a plugin's code or JSON is a finding; a test may set one to prove it is
// raised, and prose may name Claude Code's default.
import { readFileSync } from "node:fs";
import { pluginsDir, rel, report, walk } from "./walk.ts";

export const KEEP_DAYS = 36500;
const SETTING = /cleanupPeriodDays"?\s*[:=]\s*(\d+)/g;

/** The lines of `src` that give cleanupPeriodDays a number below KEEP_DAYS. */
export function deletingLines(src: string): number[] {
  const lines: number[] = [];
  for (const m of src.matchAll(SETTING)) {
    if (Number(m[1]) < KEEP_DAYS) {
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
        `${rel(file)}:${line}: cleanupPeriodDays below ${KEEP_DAYS} deletes the person's transcripts`,
      );
    }
  }
  report("no-data-deletion", findings);
}
