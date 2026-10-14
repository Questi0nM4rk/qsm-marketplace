// Stage two, extracting text: every source becomes plain text, and the run keeps going when one of
// them cannot.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { missingConverter } from "./converters.ts";
import type { Reader, Source } from "./sources.ts";
import { analyzeText, countWords, estimateTokens } from "./structure.ts";

export interface RunResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

type RunCommand = (command: string, args: readonly string[]) => RunResult;

interface SourceMetadata {
  readonly path: string;
  readonly extension: string;
  readonly bytes: number;
  /** pages, where the format has them; null where it does not */
  readonly pages: number | null;
  readonly words: number;
  readonly tokens: number;
  readonly chapters: number;
}

interface ExtractFailure {
  readonly path: string;
  readonly reason: string;
}

export interface ExtractResult {
  readonly text: string;
  readonly sources: readonly SourceMetadata[];
  readonly failed: readonly ExtractFailure[];
}

export interface ExtractDeps {
  readonly run: RunCommand;
  readonly readFile: (path: string) => string;
  /** PATH to look the converters up in */
  readonly pathValue: string;
}

function systemRun(command: string, args: readonly string[]): RunResult {
  const done = spawnSync(command, [...args], { encoding: "utf8", maxBuffer: 1024 * 1024 * 256 });
  return {
    status: done.status ?? 1,
    stdout: done.stdout ?? "",
    stderr: done.stderr ?? "",
  };
}

export function systemDeps(env: Record<string, string | undefined>): ExtractDeps {
  return {
    run: systemRun,
    readFile: (path) => readFileSync(path, "utf8"),
    pathValue: env.PATH ?? "",
  };
}

const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const TAG = /<[^>]+>/g;
const ENTITIES: readonly (readonly [RegExp, string])[] = [
  [/&nbsp;/g, " "],
  [/&amp;/g, "&"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
];

/** Enough HTML to read a book with. Not a parser: a document that needs one
 * is better handed to pandoc, which this program already knows how to call. */
export function htmlToText(html: string): string {
  const stripped = html.replace(SCRIPT_OR_STYLE, " ").replace(TAG, " ");
  const decoded = ENTITIES.reduce((text, [pattern, char]) => text.replace(pattern, char), stripped);
  return decoded
    .split("\n")
    .map((line) => line.replaceAll(/[ \t]+/g, " ").trim())
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

function viaStdout(
  deps: ExtractDeps,
  command: string,
  args: readonly string[],
): { text: string } | { reason: string } {
  const done = deps.run(command, args);
  if (done.status !== 0) {
    return { reason: `${command} exited ${done.status}: ${done.stderr.trim().slice(0, 200)}` };
  }
  return { text: done.stdout };
}

/** calibre writes to a file rather than to stdout, so the conversion needs
 * a scratch path of its own; it is removed whichever way the call ends. */
function viaFile(deps: ExtractDeps, source: Source): { text: string } | { reason: string } {
  const scratch = mkdtempSync(join(tmpdir(), "qsm-book-to-skill-convert-"));
  try {
    const out = join(scratch, `${basename(source.path)}.txt`);
    const done = deps.run("ebook-convert", [source.path, out]);
    if (done.status !== 0) {
      return { reason: `ebook-convert exited ${done.status}: ${done.stderr.trim().slice(0, 200)}` };
    }
    return { text: deps.readFile(out) };
  } catch (cause) {
    return { reason: cause instanceof Error ? cause.message : String(cause) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

type Converted = { text: string } | { reason: string };

/** One converter per reader; a new reader without an entry here fails the type check. */
const CONVERT: Record<Reader, (source: Source, deps: ExtractDeps) => Converted> = {
  text: (source, deps) => ({ text: deps.readFile(source.path) }),
  html: (source, deps) => ({ text: htmlToText(deps.readFile(source.path)) }),
  pdftotext: (source, deps) => viaStdout(deps, "pdftotext", ["-layout", source.path, "-"]),
  pandoc: (source, deps) => viaStdout(deps, "pandoc", ["-t", "plain", "--wrap=none", source.path]),
  "ebook-convert": (source, deps) => viaFile(deps, source),
};

function readSource(source: Source, deps: ExtractDeps): { text: string } | { reason: string } {
  const missing = missingConverter(source.reader, deps.pathValue);
  if (missing !== null) {
    return { reason: missing };
  }
  try {
    return CONVERT[source.reader](source, deps);
  } catch (cause) {
    return { reason: cause instanceof Error ? cause.message : String(cause) };
  }
}

/** pdftotext separates pages with a form feed. */
function pageCount(reader: Reader, text: string): number | null {
  if (reader !== "pdftotext") {
    return null;
  }
  return text.split("\f").length;
}

const SOURCE_DIVIDER = "=====";

function dividerFor(source: Source): string {
  return `${SOURCE_DIVIDER} source: ${basename(source.path)} ${SOURCE_DIVIDER}`;
}

function metadataFor(source: Source, text: string): SourceMetadata {
  return {
    path: source.path,
    extension: source.extension,
    bytes: source.bytes,
    pages: pageCount(source.reader, text),
    words: countWords(text),
    tokens: estimateTokens(text),
    chapters: analyzeText(text).chapters.length,
  };
}

/**
 * Consolidates every source that reads into one text, each behind a divider line naming the file
 * it came from, and reports the ones that did not.
 */
export function extractSources(
  sources: readonly Source[],
  deps: ExtractDeps = systemDeps(process.env),
): ExtractResult {
  const parts: string[] = [];
  const metadata: SourceMetadata[] = [];
  const failed: ExtractFailure[] = [];
  for (const source of sources) {
    const read = readSource(source, deps);
    if ("reason" in read) {
      failed.push({ path: source.path, reason: read.reason });
      continue;
    }
    metadata.push(metadataFor(source, read.text));
    parts.push(`${dividerFor(source)}\n\n${read.text.trim()}`);
  }
  return { text: parts.join("\n\n"), sources: metadata, failed };
}
