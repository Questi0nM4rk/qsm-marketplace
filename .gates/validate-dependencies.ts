#!/usr/bin/env bun
// A dependency is written twice: in plugin.json `dependencies` and as one bullet
// "- `<name>`: <reason>" in the plugin's spec, under "### Requirement: Dependencies". The two
// lists must be the same set. Every mismatch of every plugin is reported in one run.
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pluginDirs, readJson, rel, report } from "./walk.ts";

const HEADING = "### Requirement: Dependencies";
const BULLET = /^- `([^`]+)`:/;

/** The names bulleted under the Dependencies requirement, in file order. */
export function specDependencies(spec: string): string[] {
  const lines = spec.split("\n");
  const start = lines.findIndex((l) => l.trim() === HEADING);
  if (start === -1) {
    return [];
  }
  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("### ") || line.startsWith("## ")) {
      break;
    }
    const name = BULLET.exec(line)?.[1];
    if (name) {
      names.push(name);
    }
  }
  return names;
}

export function diffDependencies(manifest: string[], spec: string[]): string[] {
  const findings: string[] = [];
  for (const name of manifest) {
    if (!spec.includes(name)) {
      findings.push(`plugin.json names ${name}, the spec gives it no reason`);
    }
  }
  for (const name of spec) {
    if (!manifest.includes(name)) {
      findings.push(`the spec gives ${name} a reason, plugin.json does not declare it`);
    }
  }
  return findings;
}

function pluginFindings(dir: string): string[] {
  const manifest = readJson<{ dependencies?: string[] }>(
    resolve(dir, ".claude-plugin/plugin.json"),
  );
  const specPath = resolve(dir, "openspec/specs", basename(dir), "spec.md");
  const spec = existsSync(specPath) ? readFileSync(specPath, "utf8") : "";
  return diffDependencies(manifest?.dependencies ?? [], specDependencies(spec)).map(
    (f) => `${rel(specPath)}: ${f}`,
  );
}

if (import.meta.main) {
  report("dependencies", pluginDirs().flatMap(pluginFindings));
}
