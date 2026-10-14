// The Python extractor: a line parser over `import a.b` and
// `from <module> import <names>`. A specifier is a dotted module name, with
// leading dots for a relative import; `from pkg import x` yields both `pkg`
// and `pkg.x`, because `x` may be a submodule, and whichever names a file in
// the repository becomes an edge.
//
// ponytail: static statements only, one line each. Runtime imports
// (importlib, __import__), names continued past the first line of a
// parenthesised or backslashed import, and import-shaped lines inside a
// string are all read wrong. Upgrade path: a real Python parser.

import { posix } from "node:path";
import type { Extractor } from "./extractor.ts";

const IMPORT = /^import\s+(.+)$/;
const FROM = /^from\s+(\.*[\w.]*)\s+import\s+(.+)$/;

/** `a.b as c` -> `a.b`; `(x` -> `x`; `*` and empties drop out. */
function names(list: string): string[] {
  return list
    .split(",")
    .map((part) =>
      (
        part
          .replaceAll(/[()\\]/g, "")
          .trim()
          .split(/\s+/)[0] ?? ""
      ).trim(),
    )
    .filter((name) => name !== "" && name !== "*");
}

function scanLine(line: string): string[] {
  const statement = line.replace(/#.*$/, "").trim();
  const plain = IMPORT.exec(statement);
  if (plain) {
    return names(plain[1] ?? "");
  }
  const from = FROM.exec(statement);
  if (!from) {
    return [];
  }
  const base = from[1] ?? "";
  const joiner = base.endsWith(".") ? "" : ".";
  return [base, ...names(from[2] ?? "").map((name) => base + joiner + name)];
}

export const pyExtractor: Extractor = {
  id: "py",
  scan(source) {
    return source.split("\n").flatMap(scanLine);
  },
  resolve(spec, file, isFile) {
    const dots = /^\.*/.exec(spec)?.[0].length ?? 0;
    const rest = spec.slice(dots).split(".").filter(Boolean).join("/");
    let dir = dots === 0 ? "" : posix.dirname(file);
    for (let up = 1; up < dots; up += 1) {
      dir = posix.join(dir, "..");
    }
    const base = posix.join(dir, rest);
    const candidates =
      rest === ""
        ? [posix.join(base, "__init__.py")]
        : [`${base}.py`, posix.join(base, "__init__.py")];
    return candidates.find(isFile) ?? null;
  },
};
