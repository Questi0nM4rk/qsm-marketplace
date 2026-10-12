#!/usr/bin/env bun
// A skill or agent file caps at 12 KB (8 KB is the target), and a plugin ships no references/ directory.
// Bytes, not lines: a line is a unit the author chooses.
import { statSync } from "node:fs";
import { pluginDirs, rel, report, walk } from "./walk.ts";

export const MAX_BYTES = 12 * 1024;
const findings: string[] = [];

for (const dir of pluginDirs()) {
  for (const path of walk(dir)) {
    const r = rel(path);
    if (/\/references\//.test(r)) {
      findings.push(`${r}: no references/ in pass 1; fold it into the skill or cut it`);
      continue;
    }
    if (!/\/(skills\/[^/]+\/SKILL|agents\/[^/]+)\.md$/.test(r)) {
      continue;
    }
    const bytes = statSync(path).size;
    if (bytes > MAX_BYTES) {
      findings.push(`${r}: ${(bytes / 1024).toFixed(1)} KB over the ${MAX_BYTES / 1024} KB cap`);
    }
  }
}

report("file-size", findings);
