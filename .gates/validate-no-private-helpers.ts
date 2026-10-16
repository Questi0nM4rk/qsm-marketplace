#!/usr/bin/env bun
// A plugin does not define a helper root lib/ exports, reads HOME, CLAUDE_CONFIG_DIR and XDG_*
// only through lib/paths.ts, and a test never spreads the whole environment into a child. A file
// a hooks/tsconfig.json includes runs in the engine sandbox, which imports no root lib, so it may
// hold its own copy and is skipped.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { isRecord, isSource, rel, report, root, walk } from "./walk.ts";

const HELPERS = [
  "isRecord",
  "messageOf",
  "onPath",
  "binPath",
  "readStdin",
  "claudeDir",
  "writeAtomic",
];
const DEFINES = new RegExp(`\\b(?:function|const|let)\\s+(${HELPERS.join("|")})\\b`, "g");
const SPREAD = new RegExp(String.raw`\.\.\.\s*process` + String.raw`\.env\b`);
const BY_NAME = /\b(?:CLAUDE_CONFIG_DIR|XDG_[A-Z_]+)\b|\bhomedir\(|\benv\.HOME\b/;

// A fixture is test code: it builds the child environment a test hands to a CLI.
const isTest = (f: string): boolean => /\.test\.tsx?$/.test(f) || f.includes("/lib/fixtures/");

/** Paths (files or directories) the hooks/tsconfig.json files under dir include. */
function hooksIncludes(dir: string): string[] {
  const out: string[] = [];
  for (const file of walk(resolve(dir, "plugins"))) {
    if (!file.endsWith("/hooks/tsconfig.json")) {
      continue;
    }
    const json: unknown = JSON.parse(readFileSync(file, "utf8"));
    const include = isRecord(json) && Array.isArray(json.include) ? json.include : [];
    out.push(
      ...include
        .filter((p): p is string => typeof p === "string")
        .map((p) => resolve(dirname(file), p)),
    );
  }
  return out;
}

function fileFindings(dir: string, file: string): string[] {
  const src = readFileSync(file, "utf8");
  const inPlugin = file.startsWith(`${resolve(dir, "plugins")}/`);
  const findings: string[] = [];
  if (inPlugin) {
    for (const m of src.matchAll(DEFINES)) {
      findings.push(`${rel(file)}: defines ${m[1]}, which root lib/ exports; import it`);
    }
  }
  if (isTest(file) && SPREAD.test(src)) {
    findings.push(`${rel(file)}: spreads the whole environment into a test; use isolatedEnv`);
  }
  const byName = inPlugin || file.startsWith(`${resolve(dir, "lib")}/`);
  if (byName && !isTest(file) && file !== resolve(dir, "lib/paths.ts") && BY_NAME.test(src)) {
    findings.push(
      `${rel(file)}: reads HOME, CLAUDE_CONFIG_DIR or XDG_* by name; read it through lib/paths.ts`,
    );
  }
  return findings;
}

export function helperFindings(dir: string): string[] {
  const sandboxed = hooksIncludes(dir);
  const inSandbox = (f: string): boolean => sandboxed.some((p) => f === p || f.startsWith(`${p}/`));
  return ["lib", "plugins", ".gates"]
    .flatMap((d) => [...walk(resolve(dir, d))])
    .filter((f) => isSource(f) && !inSandbox(f))
    .flatMap((f) => fileFindings(dir, f));
}

if (import.meta.main) {
  report("no-private-helpers", helperFindings(root));
}
