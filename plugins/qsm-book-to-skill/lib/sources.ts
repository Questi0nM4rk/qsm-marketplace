// Stage one, validating input: which of the caller's paths this converter can read, and with what
// reader.

import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { Glob } from "bun";

/** How a source becomes text. The last three name an external binary. */
export type Reader = "text" | "html" | "pdftotext" | "pandoc" | "ebook-convert";

const READERS: readonly (readonly [Reader, readonly string[]])[] = [
  ["text", [".txt", ".text", ".md", ".markdown", ".rst", ".adoc", ".asciidoc"]],
  ["html", [".html", ".htm", ".xhtml"]],
  ["pdftotext", [".pdf"]],
  ["pandoc", [".epub", ".docx", ".rtf"]],
  ["ebook-convert", [".mobi", ".azw", ".azw3"]],
];

export const READER_BY_EXTENSION: ReadonlyMap<string, Reader> = new Map(
  READERS.flatMap(([reader, extensions]) => extensions.map((e) => [e, reader] as const)),
);

export interface Source {
  readonly path: string;
  readonly extension: string;
  readonly reader: Reader;
  readonly bytes: number;
}

interface Rejected {
  readonly path: string;
  readonly reason: string;
}

export interface SourceScan {
  readonly sources: readonly Source[];
  readonly rejected: readonly Rejected[];
}

const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "build", ".git"]);
/** An input holding one of these is a glob pattern, not a path. */
const GLOB_CHARACTERS = ["*", "?", "["];

function* filesUnder(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIPPED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      yield* filesUnder(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

function asSource(path: string): Source | Rejected {
  const extension = extname(path).toLowerCase();
  const reader = READER_BY_EXTENSION.get(extension);
  if (reader === undefined) {
    return { path, reason: `unsupported extension ${extension === "" ? "(none)" : extension}` };
  }
  return { path, extension, reader, bytes: statSync(path).size };
}

function isSource(candidate: Source | Rejected): candidate is Source {
  return "reader" in candidate;
}

/** The longest leading part of the pattern that holds no magic character,
 * so the walk starts at a directory instead of at the filesystem root. */
function globBase(pattern: string, cwd: string): string {
  const segments = pattern.split("/");
  const literal: string[] = [];
  for (const segment of segments.slice(0, -1)) {
    if (/[*?[]/.test(segment)) {
      break;
    }
    literal.push(segment);
  }
  return resolve(cwd, literal.join("/"));
}

function expandGlob(pattern: string, cwd: string): string[] {
  const base = globBase(pattern, cwd);
  if (!(existsSync(base) && statSync(base).isDirectory())) {
    return [];
  }
  const glob = new Glob(resolve(cwd, pattern));
  return [...filesUnder(base)]
    .filter((path) => glob.match(path))
    .toSorted((a, b) => a.localeCompare(b));
}

function resolveInput(input: string, cwd: string): { files: string[]; rejected: Rejected[] } {
  if (GLOB_CHARACTERS.some((char) => input.includes(char))) {
    const files = expandGlob(input, cwd);
    return files.length === 0
      ? { files, rejected: [{ path: input, reason: "matched no file" }] }
      : { files, rejected: [] };
  }
  const path = resolve(cwd, input);
  if (!existsSync(path)) {
    return { files: [], rejected: [{ path, reason: "does not exist" }] };
  }
  if (statSync(path).isDirectory()) {
    const files = [...filesUnder(path)].toSorted((a, b) => a.localeCompare(b));
    return files.length === 0
      ? { files, rejected: [{ path, reason: "directory holds no file" }] }
      : { files, rejected: [] };
  }
  return { files: [path], rejected: [] };
}

/**
 * Expands every input to the files behind it, then sorts each file into a source or a rejection.
 */
export function scanInputs(inputs: readonly string[], cwd: string = process.cwd()): SourceScan {
  const sources: Source[] = [];
  const rejected: Rejected[] = [];
  const seen = new Set<string>();
  for (const input of inputs) {
    const resolved = resolveInput(input, cwd);
    rejected.push(...resolved.rejected);
    const named = resolved.files.length === 1 && resolved.rejected.length === 0;
    for (const file of resolved.files) {
      if (seen.has(file)) {
        continue;
      }
      seen.add(file);
      const candidate = asSource(file);
      if (isSource(candidate)) {
        sources.push(candidate);
      } else if (named) {
        rejected.push(candidate);
      }
    }
  }
  return { sources, rejected };
}
