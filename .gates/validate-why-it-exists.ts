#!/usr/bin/env bun
// The reason a project or plugin exists is the first `##` section of its README.md, titled
// `## Why it exists`, at most five sentences. No INTENT.md remains ("intent" names the intent of a
// piece of work in its tracker epic, never the reason to exist).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pluginDirs, rel, report, root, walk } from "./walk.ts";

export const TITLE = "## Why it exists";
export const MAX_SENTENCES = 5;

/** A sentence ends at ., ! or ? followed by whitespace or the end of the section; code spans are ignored. */
export function countSentences(section: string): number {
  const text = section.replaceAll(/`[^`]*`/g, "x");
  return (text.match(/[.!?](?=\s|$)/g) ?? []).length;
}

export function checkReadme(path: string, text: string): string[] {
  const lines = text.split("\n");
  const first = lines.findIndex((l) => l.startsWith("## "));
  if (first === -1 || lines[first]?.trim() !== TITLE) {
    return [`${rel(path)}: the first "## " section must be "${TITLE}"`];
  }
  const end = lines.findIndex((l, i) => i > first && l.startsWith("## "));
  const body = lines.slice(first + 1, end === -1 ? undefined : end).join("\n");
  const count = countSentences(body);
  if (count > MAX_SENTENCES) {
    return [
      `${rel(path)}: "${TITLE}" holds ${count} sentences, at most ${MAX_SENTENCES} (a sentence ends at . ! or ? followed by whitespace or the end; code spans do not count)`,
    ];
  }
  return [];
}

if (import.meta.main) {
  const findings: string[] = [];
  const readmes = [resolve(root, "README.md"), ...pluginDirs().map((d) => resolve(d, "README.md"))];
  for (const readme of readmes) {
    if (!existsSync(readme)) {
      findings.push(`${rel(readme)}: missing, it holds "${TITLE}"`);
      continue;
    }
    findings.push(...checkReadme(readme, readFileSync(readme, "utf8")));
  }
  for (const dir of [root, ...pluginDirs()]) {
    for (const path of dir === root ? [resolve(root, "INTENT.md")] : walk(dir)) {
      if (/(^|\/)INTENT\.md$/.test(path) && existsSync(path)) {
        findings.push(`${rel(path)}: no INTENT.md, move it into README.md as "${TITLE}"`);
      }
    }
  }
  report("why-it-exists", findings);
}
