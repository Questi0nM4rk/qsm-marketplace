// The import graph: which repository file imports which, for every language that has an extractor,
// and the files within N edges of a set.

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { extname, join, posix } from "node:path";
import { cacheDir, writeAtomic } from "./cache-dir.ts";
import type { Extractor } from "./extractor.ts";
import { pyExtractor } from "./imports-py.ts";
import { tsExtractor } from "./imports-ts.ts";
import { LANGUAGE_TABLE, LANGUAGES, type Language, type LanguageInfo } from "./registry.ts";

const EXTRACTORS: Partial<Record<Language, Extractor>> = { ts: tsExtractor, py: pyExtractor };

export interface ImportGraph {
  /** Each extracted file, repository-relative, and the files it imports. */
  readonly edges: ReadonlyMap<string, readonly string[]>;
  /** Languages that had files in the set but no extractor: their imports
   * are unknown, not absent. */
  readonly noExtractor: readonly Language[];
  /** Files an extractor could not read, with the cause. */
  readonly failed: readonly { readonly file: string; readonly reason: string }[];
  /** Files parsed in this run; every other extracted file came from the cache. */
  readonly parsed: readonly string[];
}

function languageOf(file: string): Language | null {
  const ext = extname(file);
  return (
    LANGUAGES.find((language) => {
      const info: LanguageInfo = LANGUAGE_TABLE[language];
      return info.detects?.includes(ext) === true;
    }) ?? null
  );
}

/** The specifiers of `source`, from the cache or by parsing it. */
async function specifiersOf(
  graphDir: string,
  extractor: Extractor,
  source: string,
  file: string,
): Promise<{ specs: string[]; parsed: boolean }> {
  const key = createHash("sha256").update(`${extractor.id}\0${source}`).digest("hex");
  const entry = join(graphDir, `${key}.json`);
  try {
    const cached: unknown = JSON.parse(readFileSync(entry, "utf8"));
    if (Array.isArray(cached) && cached.every((spec) => typeof spec === "string")) {
      return { specs: cached, parsed: false };
    }
  } catch {
    // No entry, or an unreadable one: parse the file below.
  }
  const specs = await extractor.scan(source, file);
  writeAtomic(entry, JSON.stringify(specs));
  return { specs, parsed: true };
}

/** The graph over `files` (repository-relative) under `root`, cached under
 * `cacheRoot`: a scratch copy of a tree keeps its cache in the repository. */
export async function buildGraph(
  root: string,
  files: readonly string[],
  cacheRoot: string = root,
): Promise<ImportGraph> {
  const graphDir = cacheDir(cacheRoot, "graph");
  const isFile = (path: string): boolean => {
    if (path === ".." || path.startsWith("../") || posix.isAbsolute(path)) {
      return false;
    }
    try {
      return statSync(join(root, path)).isFile();
    } catch {
      return false;
    }
  };
  const edges = new Map<string, readonly string[]>();
  const noExtractor = new Set<Language>();
  const failed: { file: string; reason: string }[] = [];
  const parsed: string[] = [];
  for (const file of files) {
    const language = languageOf(file);
    if (language === null) {
      continue;
    }
    const extractor = EXTRACTORS[language];
    if (!extractor) {
      noExtractor.add(language);
      continue;
    }
    try {
      const { specs, parsed: fresh } = await specifiersOf(
        graphDir,
        extractor,
        readFileSync(join(root, file), "utf8"),
        file,
      );
      if (fresh) {
        parsed.push(file);
      }
      const targets = specs
        .map((spec) => extractor.resolve(spec, file, isFile))
        .filter((t) => t !== null);
      edges.set(file, [...new Set(targets)]);
    } catch (error) {
      failed.push({ file, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { edges, noExtractor: [...noExtractor], failed, parsed };
}

/** `files` and every file within `n` edges of them, following imports and
 * importers alike, sorted. */
export function within(graph: ImportGraph, files: readonly string[], n: number): string[] {
  const neighbours = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    neighbours.set(a, (neighbours.get(a) ?? new Set()).add(b));
  };
  for (const [file, targets] of graph.edges) {
    for (const target of targets) {
      link(file, target);
      link(target, file);
    }
  }
  const seen = new Set(files);
  let frontier = [...seen];
  for (let depth = 0; depth < n && frontier.length > 0; depth += 1) {
    frontier = frontier.flatMap((file) =>
      [...(neighbours.get(file) ?? [])].filter((next) => !seen.has(next)),
    );
    for (const file of frontier) {
      seen.add(file);
    }
  }
  return [...seen].sort();
}
