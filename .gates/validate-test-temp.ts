#!/usr/bin/env bun
// Test code makes temp dirs through sandboxDir of lib/fixtures/sandbox.ts only, because that is the
// one place that removes them after each test. Test code is a *.test.ts(x) file and every module
// imported by test code alone (a fixture or helper); product code under test makes its own.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { rel, report, root, walk } from "./walk.ts";

export const CALLS = ["mkdtemp", "mkdtempSync", "tmpdir"];
const SANDBOX = resolve(root, "lib/fixtures/sandbox.ts");
const REGEX_AFTER = new Set("(,=:[!&|?{};+-*%<>~^");
const REGEX_WORD = /\b(return|typeof|case|of|in)$/;

/** Where the escape-aware scan from `from` stops: at the first j where `stops(j)`, or the end. */
function scanTo(src: string, from: number, stops: (j: number) => boolean): number {
  let j = from;
  while (j < src.length && !stops(j)) {
    j += src[j] === "\\" ? 2 : 1;
  }
  return j;
}

/** The end of a regex literal opening at i: a `/` outside a character class. */
function regexEnd(src: string, i: number): number {
  let inClass = false;
  const stop = (j: number): boolean => {
    inClass = src[j] === "[" || (inClass && src[j] !== "]");
    return src[j] === "\n" || (!inClass && src[j] === "/");
  };
  return scanTo(src, i + 1, stop) + 1;
}

/** The end of a comment opening at i, or -1 when none opens there. */
function commentEnd(src: string, i: number): number {
  if (src.startsWith("//", i)) {
    return scanTo(src, i, (j) => src[j] === "\n");
  }
  if (!src.startsWith("/*", i)) {
    return -1;
  }
  const end = src.indexOf("*/", i + 2);
  return end === -1 ? src.length : end + 2;
}

/** The end of a comment, string or regex literal opening at i, or -1 when none opens there. */
function literalEnd(src: string, i: number, tail: string): number {
  const c = src[i];
  const comment = commentEnd(src, i);
  if (comment !== -1) {
    return comment;
  }
  if (c === '"' || c === "'") {
    return scanTo(src, i + 1, (j) => src[j] === c || src[j] === "\n") + 1;
  }
  const regexHere = tail === "" || REGEX_AFTER.has(tail.at(-1) ?? "") || REGEX_WORD.test(tail);
  return c === "/" && regexHere ? regexEnd(src, i) : -1;
}

/** The source with comments, strings, template text and regex literals blanked; newlines kept. */
export function code(src: string): string {
  const parts: string[] = [];
  // the brace depth at each open `${`, so its closing brace resumes the template text
  const opens: number[] = [];
  let depth = 0;
  let tail = "";
  let i = 0;
  const take = (to: number, blank: boolean): void => {
    const text = src.slice(i, to);
    parts.push(blank ? text.replaceAll(/[^\n]/g, " ") : text);
    tail = blank ? tail : (tail + text).trimEnd().slice(-8);
    i = to;
  };
  const templateText = (): void => {
    take(
      scanTo(src, i, (j) => src[j] === "`" || src.startsWith("${", j)),
      true,
    );
    if (src.startsWith("${", i)) {
      opens.push(depth);
    }
    take(Math.min(src.length, i + (src[i] === "`" ? 1 : 2)), false);
  };
  while (i < src.length) {
    const end = literalEnd(src, i, tail);
    const c = src[i];
    if (end !== -1) {
      take(end, true);
    } else if (c === "`" || (c === "}" && opens.at(-1) === depth)) {
      opens.splice(c === "}" ? -1 : opens.length);
      take(i + 1, false);
      templateText();
    } else {
      depth += c === "{" ? 1 : c === "}" ? -1 : 0;
      take(i + 1, false);
    }
  }
  return parts.join("");
}

/** `line: name()` for each call of a temp-dir maker in the source. */
export function calls(src: string): string[] {
  const pattern = new RegExp(String.raw`(?<![\w$])(${CALLS.join("|")})\s*\(`, "g");
  return code(src)
    .split("\n")
    .flatMap((line, n) => [...line.matchAll(pattern)].map((m) => `${n + 1}: ${m[1]}()`));
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
      calls(readFileSync(f, "utf8")).map(
        (c) =>
          `${rel(f)}:${c} in test code; make temp dirs with sandboxDir from lib/fixtures/sandbox.ts`,
      ),
    );
  report("test-temp", findings);
}
