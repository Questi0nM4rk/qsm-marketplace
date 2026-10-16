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
// root lib's messageOf body, written inline
const INLINE_MESSAGE_OF = /\b(\w+) instanceof Error \? \1\.message : String\(\1\)/;
const SPREAD = new RegExp(String.raw`\.\.\.\s*process` + String.raw`\.env\b`);
const BY_NAME = /\b(?:CLAUDE_CONFIG_DIR|XDG_[A-Z_]+)\b|\bhomedir\(|\benv\.HOME\b/;

// A fixture is test code: it builds the child environment a test hands to a CLI.
const isTest = (f: string): boolean => /\.test\.tsx?$/.test(f) || f.includes("/lib/fixtures/");

/** Paths (files or directories) the hooks/tsconfig.json files under dir include, globs expanded. */
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
        .flatMap((p) =>
          p.includes("*")
            ? [...new Bun.Glob(p).scanSync({ cwd: dirname(file), absolute: true })]
            : [resolve(dirname(file), p)],
        ),
    );
  }
  return out;
}

function fileFindings(dir: string, file: string): string[] {
  const src = readFileSync(file, "utf8");
  const inPlugin = file.startsWith(`${resolve(dir, "plugins")}/`);
  const inCode = inPlugin || file.startsWith(`${resolve(dir, "lib")}/`);
  const checks: [boolean, RegExp, string][] = [
    [
      inCode && file !== resolve(dir, "lib/outcome.ts"),
      INLINE_MESSAGE_OF,
      "writes messageOf's body inline; import messageOf",
    ],
    [isTest(file), SPREAD, "spreads the whole environment into a test; use isolatedEnv"],
    [
      inCode && !isTest(file) && file !== resolve(dir, "lib/paths.ts"),
      BY_NAME,
      "reads HOME, CLAUDE_CONFIG_DIR or XDG_* by name; read it through lib/paths.ts",
    ],
  ];
  return [
    ...(inPlugin ? [...src.matchAll(DEFINES)] : []).map(
      (m) => `${rel(file)}: defines ${m[1]}, which root lib/ exports; import it`,
    ),
    ...checks.filter(([on, re]) => on && re.test(src)).map(([, , msg]) => `${rel(file)}: ${msg}`),
  ];
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
