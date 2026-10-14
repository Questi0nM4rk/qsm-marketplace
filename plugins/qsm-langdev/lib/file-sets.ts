// The file sets a run hands its checkers, each computed once per run: which set a checker scores is
// its registry declaration (`fileSet`), never its own choice at run time.

import { buildGraph, within } from "./import-graph.ts";
import type { FileSet, Language } from "./registry.ts";

/** One set's size in the report; a `changed+N` set also names every
 * language whose imports are unknown, because it had no extractor. */
export interface SetSize {
  set: string;
  files: number;
  noExtractor?: readonly Language[];
}

/** The name a set goes by in the report and in a skip. */
export function setName(fileSet: FileSet): string {
  return typeof fileSet === "string" ? fileSet : `changed+${fileSet.changedPlus}`;
}

/** A named path as a repository-relative prefix: `./src/` is `src`, and
 * `.` (or nothing at all) is the root, the empty prefix. */
function prefixOf(path: string): string {
  let out = path;
  while (out.startsWith("./")) {
    out = out.slice(2);
  }
  out = out.replace(/\/+$/, "");
  return out === "." ? "" : out;
}

/** Every listed path that is, or lies under, one of `named`; the root when
 * `named` is empty. Sorted, each path once. */
export function givenSet(listed: readonly string[], named: readonly string[]): string[] {
  const prefixes = named.length === 0 ? [""] : named.map(prefixOf);
  const under = (path: string): boolean =>
    prefixes.some((p) => p === "" || path === p || path.startsWith(`${p}/`));
  return [...new Set(listed)].filter(under).toSorted((a, b) => a.localeCompare(b));
}

/** A tree a checker scores: its directory and the paths it holds. */
interface Tree {
  root: string;
  files: readonly string[];
}

/**
 * `changed` and every file within `n` import edges of it, on either side: an importer of a deleted
 * file is reached through the reference side's graph.
 */
export async function changedPlusSet(
  cacheRoot: string,
  trees: readonly Tree[],
  changed: readonly string[],
  n: number,
): Promise<{ files: string[]; noExtractor: Language[] }> {
  const graphs = await Promise.all(trees.map((t) => buildGraph(t.root, t.files, cacheRoot)));
  const files = new Set(graphs.flatMap((graph) => within(graph, changed, n)));
  const noExtractor = new Set(graphs.flatMap((graph) => graph.noExtractor));
  return {
    files: [...files].toSorted((a, b) => a.localeCompare(b)),
    noExtractor: [...noExtractor].toSorted((a, b) => a.localeCompare(b)),
  };
}

/** One line: `changed: 2 files, given: 40 files, changed+1: 5 files`. */
export function describeSets(sets: readonly SetSize[]): string {
  return sets
    .map(({ set, files, noExtractor }) => {
      const size = `${set}: ${files} ${files === 1 ? "file" : "files"}`;
      return noExtractor === undefined || noExtractor.length === 0
        ? size
        : `${size} (no import extractor: ${noExtractor.join(", ")})`;
    })
    .join(", ");
}
