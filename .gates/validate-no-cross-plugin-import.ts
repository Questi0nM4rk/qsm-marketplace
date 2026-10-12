#!/usr/bin/env bun
// A plugin imports from root lib/ and from itself only. lib/ imports from lib/ only.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pluginDirs, rel, report, root, walk } from "./walk.ts";

const findings: string[] = [];
const IMPORT = /(?:from|import)\s*["']([^"']+)["']/g;
const libDir = resolve(root, "lib");

/** Relative import specifiers of a source text, resolved against its file. */
function relativeImports(file: string, text: string): { spec: string; target: string }[] {
  return [...text.matchAll(IMPORT)]
    .map((m) => m[1] ?? "")
    .filter((spec) => spec.startsWith("."))
    .map((spec) => ({ spec, target: resolve(dirname(file), spec) }));
}

function check(file: string, allowedRoots: string[]): void {
  for (const { spec, target } of relativeImports(file, readFileSync(file, "utf8"))) {
    if (!allowedRoots.some((r) => target === r || target.startsWith(`${r}/`))) {
      findings.push(`${rel(file)}: imports ${spec} -> ${rel(target)}`);
    }
  }
}

for (const dir of pluginDirs()) {
  for (const f of walk(dir)) {
    if (f.endsWith(".ts")) {
      check(f, [dir, libDir]);
    }
  }
}
for (const f of walk(libDir)) {
  if (f.endsWith(".ts")) {
    check(f, [libDir]);
  }
}

report("no-cross-plugin-import", findings);
