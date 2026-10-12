// What the structural graph file says: the symbols of one file.

import { readFileSync } from "node:fs";

export interface Symbol {
  readonly label: string;
  readonly line: number;
}

interface GraphNode {
  readonly id: string;
  readonly label?: string;
  readonly source_file?: string;
  /** "L<start line>" */
  readonly source_location?: string;
}

export interface Graph {
  readonly nodes: readonly GraphNode[];
}

export function readGraph(graphFile: string): Graph {
  const graph = JSON.parse(readFileSync(graphFile, "utf8")) as Partial<Graph>;
  return { nodes: graph.nodes ?? [] };
}

/** Every node of `file` (a path relative to the repository) with its start line, by line. */
export function symbolsOf(graph: Graph, file: string): Symbol[] {
  return graph.nodes
    .filter((node) => node.source_file === file)
    .map((node) => ({ label: node.label ?? "", line: Number(node.source_location?.slice(1)) }))
    .filter((symbol) => Number.isInteger(symbol.line))
    .sort((a, b) => a.line - b.line);
}

/** The last symbol starting at or above `line`. */
export function enclosing(symbols: readonly Symbol[], line: number): Symbol | undefined {
  return symbols.filter((symbol) => symbol.line <= line).at(-1);
}
