// What a plugin's files refer to, as names: other plugins of this marketplace, outside CLI tools
// (a whole word from the searched-names list), web sources (hosts of URLs) and MCP servers. Nothing is
// resolved or checked.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isRecord } from "../../../../lib/outcome.ts";
// Imported as text so `bun build --compile` embeds the copy the binary falls back to.
import builtIn from "../../references.txt" with { type: "text" };

export const REF_KINDS = ["plugin", "tool", "web", "mcp"] as const;
export type RefKind = (typeof REF_KINDS)[number];

export interface Reference {
  readonly name: string;
  readonly kind: RefKind;
  /** listed in `dependencies` */
  readonly dependency: boolean;
  /** the items after `<plugin>:` */
  readonly items: readonly string[];
}

/** Where the searched names live, from the marketplace root. */
const LIST = join("plugins", "qsm-builder", "references.txt");

/** One name per line, `#` starts a comment. */
function parseNames(text: string): Set<string> {
  return new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, "").trim())
      .filter((line) => line !== ""),
  );
}

/** The searched names: the shown marketplace's own list when it has one, else the built-in copy. */
export function searchedNames(root: string): ReadonlySet<string> {
  const file = join(root, LIST);
  return parseNames(existsSync(file) ? readFileSync(file, "utf8") : builtIn);
}

/** A whole word: a letter, digit, underscore or hyphen on either side continues it. */
function wordsOf(names: ReadonlySet<string>): RegExp | null {
  const alt = [...names]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return alt.length === 0 ? null : new RegExp(`(?<![\\w-])(?:${alt.join("|")})(?![\\w-])`, "g");
}

const TEXT = /\.(md|json|ya?ml|tsx?|sh)$/;
const SKIP = new Set(["results", "node_modules", "types"]);

export function* textFiles(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) {
        yield* textFiles(join(dir, e.name));
      }
    } else if (
      TEXT.test(e.name) &&
      !/\.(generated|test)\.ts$/.test(e.name) &&
      statSync(join(dir, e.name)).size < 400_000
    ) {
      yield join(dir, e.name);
    }
  }
}

function mcpServers(dir: string): string[] {
  const file = join(dir, ".mcp.json");
  if (!existsSync(file)) {
    return [];
  }
  try {
    const cfg: unknown = JSON.parse(readFileSync(file, "utf8"));
    return isRecord(cfg) && isRecord(cfg.mcpServers) ? Object.keys(cfg.mcpServers) : [];
  } catch {
    return [];
  }
}

interface Found {
  readonly plugins: Map<string, Set<string>>;
  readonly tools: Set<string>;
  readonly hosts: Set<string>;
  readonly mcp: Set<string>;
}

/** What one plugin's scan looks for: its own name (never a reference), the plugins of the marketplace, the searched words. */
export interface Scope {
  readonly self: string;
  readonly known: ReadonlySet<string>;
  readonly words: RegExp | null;
}

export const scopeOf = (
  self: string,
  known: ReadonlySet<string>,
  searched: ReadonlySet<string>,
): Scope => ({ self, known, words: wordsOf(searched) });

function scan(text: string, found: Found, { self, known, words }: Scope): void {
  for (const m of text.matchAll(/\bqsm-[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?::([a-z][a-z0-9-]*))?/g)) {
    const [name = ""] = m[0].split(":");
    if (name !== self && known.has(name)) {
      const set = found.plugins.get(name) ?? new Set<string>();
      set.add(m[1] ?? "");
      found.plugins.set(name, set);
    }
  }
  for (const m of words === null ? [] : text.matchAll(words)) {
    found.tools.add(m[0]);
  }
  for (const m of text.matchAll(/https?:\/\/([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/gi)) {
    found.hosts.add((m[1] ?? "").toLowerCase());
  }
  for (const m of text.matchAll(/\bmcp__([a-zA-Z0-9-]+)__/g)) {
    found.mcp.add(m[1] ?? "");
  }
}

const plain = (kind: RefKind, names: Iterable<string>): Reference[] =>
  [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, kind, dependency: false, items: [] }));

/** The names found in `files`; `mcp` are servers the plugin declares beyond what the text names. */
export function refsOfFiles(
  scope: Scope,
  files: Iterable<string>,
  dependencies: readonly string[],
  mcp: readonly string[] = [],
): Reference[] {
  const found: Found = {
    plugins: new Map(dependencies.map((d) => [d, new Set<string>()])),
    tools: new Set(),
    hosts: new Set(),
    mcp: new Set(mcp),
  };
  for (const file of files) {
    scan(readFileSync(file, "utf8"), found, scope);
  }
  const pluginRefs: Reference[] = [...found.plugins]
    .map(([name, set]) => ({
      name,
      kind: "plugin" as const,
      dependency: dependencies.includes(name),
      items: [...set].filter((x) => x !== "").sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [
    ...pluginRefs,
    ...plain("tool", found.tools),
    ...plain("mcp", found.mcp),
    ...plain("web", found.hosts),
  ];
}

/** Every name in a plugin's files (the plugin level). */
export function refsOf(scope: Scope, dir: string, dependencies: readonly string[]): Reference[] {
  return refsOfFiles(scope, textFiles(dir), dependencies, mcpServers(dir));
}

/** The names in a plugin's files that are not a skill's or an agent's own (scripts, lib, qsm.json, docs). */
export function refsOutsideParts(
  scope: Scope,
  dir: string,
  dependencies: readonly string[],
): Reference[] {
  const parts = [join(dir, "skills"), join(dir, "agents")];
  const files = [...textFiles(dir)].filter((f) => !parts.some((d) => f.startsWith(`${d}/`)));
  return refsOfFiles(scope, files, dependencies, mcpServers(dir));
}
