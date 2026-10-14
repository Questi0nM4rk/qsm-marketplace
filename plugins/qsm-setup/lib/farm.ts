import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fishCompletion, MARKER, writeCompletion } from "../../../lib/completions.ts";
import { readRecord, sha256 } from "../../../lib/install-base.ts";
import type { CommandDecl } from "../../../lib/qsm-manifest.ts";
import type { PluginNode } from "./discover.ts";

export interface DeclaredBin {
  readonly plugin: string;
  readonly bin: string;
  readonly entry: string;
}
export interface FarmReport {
  readonly missingBins: readonly string[];
  readonly wroteCompletions: readonly string[];
  readonly prunedCompletions: readonly string[];
  readonly removedBins: readonly string[];
  readonly stale: boolean;
}

export function declaredBins(nodes: readonly PluginNode[]): DeclaredBin[] {
  const out: DeclaredBin[] = [];
  for (const n of nodes) {
    for (const [bin, entry] of Object.entries(n.bins)) {
      out.push({ plugin: n.name, bin, entry });
    }
  }
  return out;
}

export interface RelinkOptions {
  readonly binDir: string;
  readonly completionDir: string;
  readonly recordPath: string;
  /** Report only; write nothing. */
  readonly check: boolean;
}

function syncCompletions(
  declared: readonly DeclaredBin[],
  commands: Readonly<Record<string, CommandDecl>>,
  opts: RelinkOptions,
): string[] {
  const wrote: string[] = [];
  for (const d of declared) {
    const target = join(opts.completionDir, `${d.bin}.fish`);
    const content = fishCompletion(d.bin, commands);
    const current = existsSync(target) ? readFileSync(target, "utf8") : null;
    const foreign = current !== null && !current.includes(MARKER);
    if (current === content || foreign) {
      continue;
    }
    wrote.push(d.bin);
    if (!opts.check) {
      writeCompletion(opts.completionDir, d.bin, content);
    }
  }
  return wrote;
}

function pruneCompletions(declaredNames: ReadonlySet<string>, opts: RelinkOptions): string[] {
  if (!existsSync(opts.completionDir)) {
    return [];
  }
  const pruned: string[] = [];
  for (const file of readdirSync(opts.completionDir)) {
    const bin = file.endsWith(".fish") ? file.slice(0, -".fish".length) : null;
    if (bin === null || declaredNames.has(bin)) {
      continue;
    }
    const path = join(opts.completionDir, file);
    if (!readFileSync(path, "utf8").includes(MARKER)) {
      continue;
    }
    pruned.push(bin);
    if (!opts.check) {
      unlinkSync(path);
    }
  }
  return pruned;
}

/** A bin the last build produced that no plugin declares any more, still
 * byte-identical to what we built, is ours to remove. */
export function removeUndeclaredBins(
  declaredNames: ReadonlySet<string>,
  opts: RelinkOptions,
): string[] {
  const removed: string[] = [];
  const record = readRecord(opts.recordPath);
  for (const [bin, entry] of Object.entries(record?.bins ?? {})) {
    const path = join(opts.binDir, bin);
    const ours = existsSync(path) && sha256(path) === entry.sha256;
    if (declaredNames.has(bin) || !ours) {
      continue;
    }
    removed.push(bin);
    if (!opts.check) {
      unlinkSync(path);
    }
  }
  return removed;
}

export function relink(nodes: readonly PluginNode[], opts: RelinkOptions): FarmReport {
  const declared = declaredBins(nodes);
  const declaredNames = new Set(declared.map((d) => d.bin));
  const commands = Object.fromEntries(
    nodes.flatMap((n): [string, CommandDecl][] => Object.entries(n.commands)),
  );
  const missingBins = declared
    .filter((d) => !existsSync(join(opts.binDir, d.bin)))
    .map((d) => d.bin);
  const wroteCompletions = syncCompletions(declared, commands, opts);
  const prunedCompletions = pruneCompletions(declaredNames, opts);
  const removedBins = removeUndeclaredBins(declaredNames, opts);
  const changes =
    missingBins.length + wroteCompletions.length + prunedCompletions.length + removedBins.length;
  return { missingBins, wroteCompletions, prunedCompletions, removedBins, stale: changes > 0 };
}
