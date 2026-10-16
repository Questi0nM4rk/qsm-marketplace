#!/usr/bin/env bun
// Test code makes temp dirs through sandboxDir of lib/fixtures/sandbox.ts only, because that is the
// one place that removes them after each test. Test code is a *.test.ts(x) file and every module
// imported by test code alone (a fixture or helper); product code under test makes its own.
// A namespace import of node:fs or node:os is not seen; the run guard catches what it leaves.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { rel, report, root, walk } from "./walk.ts";

const SANDBOX = resolve(root, "lib/fixtures/sandbox.ts");
const IMPORT = /import\s*\{([^}]*)\}\s*from\s*["'](?:node:)?(?:fs|fs\/promises|os)["']/g;

/** The temp-dir makers a source imports from node:fs or node:os. */
export function makers(src: string): string[] {
  return [...src.matchAll(IMPORT)].flatMap((m) =>
    [...(m[1] ?? "").matchAll(/\b(?:mkdtemp|mkdtempSync|tmpdir)\b/g)].map((n) => n[0]),
  );
}

/** For each module, the files that import it by a relative path. */
function importersOf(files: string[]): Map<string, Set<string>> {
  const importers = new Map<string, Set<string>>();
  for (const file of files) {
    const loader = file.endsWith(".tsx") ? "tsx" : "ts";
    for (const imp of new Bun.Transpiler({ loader }).scanImports(
      readFileSync(file, "utf8").replace(/^#!.*/, ""),
    )) {
      const target = resolve(dirname(file), imp.path);
      if (imp.path.startsWith(".")) {
        importers.set(target, (importers.get(target) ?? new Set()).add(file));
      }
    }
  }
  return importers;
}

/** Test files, plus every module that only test code imports, to a fixed point. */
export function testCode(files: string[]): Set<string> {
  const importers = importersOf(files);
  const tests = new Set(files.filter((f) => /\.test\.tsx?$/.test(f)));
  const onlyByTests = (f: string): boolean => {
    const by = [...(importers.get(f) ?? [])];
    return !tests.has(f) && by.length > 0 && by.every((t) => tests.has(t));
  };
  for (let next = files.filter(onlyByTests); next.length > 0; next = files.filter(onlyByTests)) {
    for (const f of next) {
      tests.add(f);
    }
  }
  return tests;
}

if (import.meta.main) {
  const files = ["lib", "plugins", ".gates"]
    .flatMap((d) => [...walk(resolve(root, d))])
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".d.ts"));
  const findings = [...testCode(files)]
    .filter((f) => f !== SANDBOX)
    .toSorted()
    .flatMap((f) =>
      makers(readFileSync(f, "utf8")).map(
        (name) =>
          `${rel(f)}: imports ${name} in test code; make temp dirs with sandboxDir from lib/fixtures/sandbox.ts`,
      ),
    );
  report("test-temp", findings);
}
