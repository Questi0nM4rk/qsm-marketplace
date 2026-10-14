// What the structural graph file says: the symbols of one file.

import { readFileSync } from "node:fs";
import { isRecord } from "../../../lib/outcome.ts";

export interface CodeSymbol {
  readonly label: string;
  readonly line: number;
}

interface GraphNode {
  readonly label?: string | undefined;
  readonly source_file?: string | undefined;
  /** "L<start line>" */
  readonly source_location?: string | undefined;
}

export interface Graph {
  readonly nodes: readonly GraphNode[];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseNode(value: unknown): GraphNode {
  if (!isRecord(value)) {
    throw new Error("graph node is not an object");
  }
  return {
    label: optionalString(value.label),
    source_file: optionalString(value.source_file),
    source_location: optionalString(value.source_location),
  };
}

/** The graph file graphify wrote; a file without `nodes` is an empty graph, a malformed node throws. */
export function readGraph(graphFile: string): Graph {
  const graph: unknown = JSON.parse(readFileSync(graphFile, "utf8"));
  const nodes = isRecord(graph) ? graph.nodes : undefined;
  return { nodes: Array.isArray(nodes) ? nodes.map((node) => parseNode(node)) : [] };
}

/** Every node of `file` (a path relative to the repository) with its start line, by line. */
export function symbolsOf(graph: Graph, file: string): CodeSymbol[] {
  return graph.nodes
    .filter((node) => node.source_file === file)
    .map((node) => ({ label: node.label ?? "", line: Number(node.source_location?.slice(1)) }))
    .filter((symbol) => Number.isInteger(symbol.line))
    .sort((a, b) => a.line - b.line);
}

/** The last symbol starting at or above `line`. */
export function enclosing(symbols: readonly CodeSymbol[], line: number): CodeSymbol | undefined {
  return symbols.filter((symbol) => symbol.line <= line).at(-1);
}
