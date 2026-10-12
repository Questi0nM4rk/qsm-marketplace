// The TypeScript and JavaScript extractor.

import { extname, posix } from "node:path";
import { Transpiler } from "bun";
import type { Extractor } from "./extractor.ts";

const LOADERS: Record<string, "ts" | "tsx" | "js" | "jsx"> = {
  ".ts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".jsx": "jsx",
  ".mjs": "js",
  ".cjs": "js",
};

const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs"];

export const tsExtractor: Extractor = {
  id: "ts",
  scan(source, file) {
    const loader = LOADERS[extname(file)] ?? "ts";
    return new Transpiler({ loader }).scanImports(source).map((entry) => entry.path);
  },
  resolve(spec, file, isFile) {
    if (!(spec.startsWith("./") || spec.startsWith("../"))) {
      return null;
    }
    const base = posix.join(posix.dirname(file), spec);
    const candidates = [
      base,
      ...EXTENSIONS.map((ext) => base + ext),
      ...EXTENSIONS.map((ext) => `${base}/index${ext}`),
    ];
    return candidates.find(isFile) ?? null;
  },
};
