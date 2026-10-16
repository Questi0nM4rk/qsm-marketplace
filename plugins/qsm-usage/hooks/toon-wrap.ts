// Which tool results are worth asking about, and the header a conversion reaches the model under.

import { isPlainObject } from "../lib/toon-scalar.ts";

/** Output this short is under the binary's ~1,000-token threshold at any
 * format, so it is not worth starting a process for. */
export const MIN_CHARS = 4000;
export const RAW_PREFIX = "QSM_TOON=0";
export const WRAP_TIMEOUT_MS = 10_000;

const MCP_PREFIX = "mcp__";
const FILE_PRINTERS = new Set(["cat", "head", "tail"]);

/** `*` is any run of characters, everything else literal, the whole text. */
export function globMatches(pattern: string, text: string): boolean {
  const body = pattern
    .split("*")
    .map((part) => part.replaceAll(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}$`, "s").test(text);
}

/** A command whose output is a file's exact text: the model edits by it. */
export function printsFile(command: string): boolean {
  return command
    .split(/\|\||&&|[|;]/)
    .some((segment) => FILE_PRINTERS.has(segment.trim().split(/\s+/)[0] ?? ""));
}

/** The wrap-list pattern a call matches, or null: Bash patterns match the
 * command, `mcp__` patterns the tool name. `Read` and every other tool never. */
export function matchingPattern(
  patterns: readonly string[],
  tool: string,
  command: string | null,
): string | null {
  if (tool.startsWith(MCP_PREFIX)) {
    return patterns.find((p) => p.startsWith(MCP_PREFIX) && globMatches(p, tool)) ?? null;
  }
  if (tool !== "Bash" || command === null) {
    return null;
  }
  const trimmed = command.trim();
  if (trimmed.startsWith(RAW_PREFIX) || printsFile(trimmed)) {
    return null;
  }
  return patterns.find((p) => !p.startsWith(MCP_PREFIX) && globMatches(p, trimmed)) ?? null;
}

/** How the header says to get the raw output back. */
export function rawHint(pattern: string, command: string | null): string {
  return command === null
    ? `drop "${pattern}" from the qsm-usage toonWrap option`
    : `${RAW_PREFIX} ${command.trim()}`;
}

export interface Offer {
  readonly pattern: string;
  readonly raw: string;
  readonly hint: string;
}

/**
 * One tool call as `offerOf` reads it: which tool, its Bash command (null for an MCP tool), and
 * the raw text it printed (null when there is none to read).
 */
export interface Call {
  readonly tool: string;
  readonly command: string | null;
  readonly raw: string | null;
}

/** What to ask the binary about, or null when the call passes without
 * asking: no wrap-list match (which covers `Read`, file printers and
 * `QSM_TOON=0`), or output too short to matter. */
export function offerOf(patterns: readonly string[], call: Call): Offer | null {
  const pattern = matchingPattern(patterns, call.tool, call.command);
  const { raw } = call;
  if (pattern === null || raw === null || raw.length <= MIN_CHARS) {
    return null;
  }
  return { pattern, raw, hint: rawHint(pattern, call.command) };
}

function kilo(tokens: number): string {
  return `${(tokens / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

export interface Conversion {
  text: string;
  fromTokens: number;
  toTokens: number;
}

const FORMATS = new Set(["json", "yaml", "toml"]);

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** The TOON text under its header line when the binary said to use it, null
 * when it said to keep the original; a data shape it never prints throws. */
export function conversionOf(data: unknown, hint: string): Conversion | null {
  const d: Record<string, unknown> = isPlainObject(data) ? data : {};
  if (d.use === "original") {
    return null;
  }
  const { format, toon, originalTokens, toonTokens } = d;
  if (
    d.use !== "toon" ||
    typeof format !== "string" ||
    !FORMATS.has(format) ||
    typeof toon !== "string" ||
    !isCount(originalTokens) ||
    !isCount(toonTokens)
  ) {
    throw new Error(`qsm-usage toon wrap: unexpected data: ${JSON.stringify(data).slice(0, 200)}`);
  }
  const header = `[qsm-toon: ${format.toUpperCase()} -> TOON, ${kilo(originalTokens)} -> ${kilo(toonTokens)} tokens; raw: ${hint}]`;
  return { text: `${header}\n${toon}`, fromTokens: originalTokens, toTokens: toonTokens };
}
