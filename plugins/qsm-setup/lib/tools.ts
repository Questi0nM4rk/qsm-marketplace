// Tools: the qsm binaries on origin/main next to the ones on this machine.
import { parseManifest, type QsmManifest, verbsOf } from "../../../lib/qsm-manifest.ts";
import type { PluginNode } from "./discover.ts";

export interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ToolsProbes {
  /** git in the marketplace checkout */
  readonly git: (args: readonly string[]) => GitResult;
  /** the qsm-* binaries installed on this machine */
  readonly installed: () => ReadonlySet<string>;
  /** a file's modification time, or null when it is not there */
  readonly mtime: (path: string) => Date | null;
}

interface Verb {
  readonly verb: string;
  readonly description: string;
}

interface BinaryReport {
  readonly bin: string;
  /** the plugin that declares it on main, else in the checkout, else null */
  readonly plugin: string | null;
  readonly installed: boolean;
  /** declared on main and not in the checkout */
  readonly newOnMain: boolean;
  /** installed, and no plugin on main declares it */
  readonly goneFromMain: boolean;
  /** on main and not in the checkout, for a binary both declare */
  readonly added: readonly Verb[];
  /** in the checkout and not on main, for a binary both declare */
  readonly removed: readonly string[];
  /** main's verbs, or the checkout's for a binary gone from main */
  readonly verbs: readonly Verb[];
}

export interface ToolsReport {
  /** when origin/main was last fetched, ISO 8601, or null when unknown */
  readonly fetchedAt: string | null;
  readonly fetched: boolean;
  readonly binaries: readonly BinaryReport[];
}

export type ToolsResult =
  | { readonly kind: "ok"; readonly report: ToolsReport }
  | { readonly kind: "missing" | "failed"; readonly message: string };

const MAIN = "origin/main";

interface Declared {
  readonly plugin: string;
  readonly verbs: ReadonlyMap<string, string>;
}

function declared(plugin: string, manifest: QsmManifest): Map<string, Declared> {
  const out = new Map<string, Declared>();
  for (const bin of Object.keys(manifest.qsm.bin ?? {})) {
    const verbs = new Map<string, string>();
    for (const [verb, decl] of verbsOf(manifest, bin)) {
      verbs.set(verb, decl.description);
    }
    out.set(bin, { plugin, verbs });
  }
  return out;
}

/** Every binary a plugin's qsm.json declares on main, by name. */
function readMain(git: ToolsProbes["git"]): Map<string, Declared> | string {
  const tree = git(["ls-tree", "-r", "--name-only", MAIN, "--", "plugins"]);
  if (tree.code !== 0) {
    return `${MAIN} is not there to read (${tree.stderr.trim()}); run: qsm-setup tools --fetch`;
  }
  const out = new Map<string, Declared>();
  const files = tree.stdout.split("\n").filter((f) => /^plugins\/[^/]+\/qsm\.json$/.test(f));
  for (const file of files) {
    const shown = git(["show", `${MAIN}:${file}`]);
    const plugin = file.split("/")[1] ?? file;
    let manifest: QsmManifest;
    try {
      manifest = parseManifest(JSON.parse(shown.stdout), `${MAIN}:${file}`);
    } catch (error) {
      return `not a readable qsm.json: ${error instanceof Error ? error.message : String(error)}`;
    }
    for (const [bin, d] of declared(plugin, manifest)) {
      out.set(bin, d);
    }
  }
  return out;
}

function readLocal(nodes: readonly PluginNode[]): Map<string, Declared> {
  const out = new Map<string, Declared>();
  for (const node of nodes) {
    const manifest: QsmManifest = { qsm: { bin: node.bins, commands: node.commands } };
    for (const [bin, d] of declared(node.name, manifest)) {
      out.set(bin, d);
    }
  }
  return out;
}

/** FETCH_HEAD's time when git keeps one, else the remote ref's reflog. */
function lastFetch(p: ToolsProbes): string | null {
  const common = p.git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (common.code === 0) {
    const at = p.mtime(`${common.stdout.trim()}/FETCH_HEAD`);
    if (at !== null) {
      return at.toISOString();
    }
  }
  const log = p.git(["reflog", "show", "-n1", "--date=iso-strict", "--format=%gd", MAIN]);
  const m = /@\{(.+)\}/.exec(log.stdout);
  return log.code === 0 && m?.[1] !== undefined ? m[1] : null;
}

function toVerbs(verbs: ReadonlyMap<string, string>): Verb[] {
  return [...verbs].map(([verb, description]) => ({ verb, description }));
}

/** Verbs main adds and removes; only a binary both sides declare has any. */
function verbDiff(
  main: Declared | undefined,
  local: Declared | undefined,
): Pick<BinaryReport, "added" | "removed"> {
  if (main === undefined || local === undefined) {
    return { added: [], removed: [] };
  }
  return {
    added: toVerbs(main.verbs).filter((v) => !local.verbs.has(v.verb)),
    removed: [...local.verbs.keys()].filter((v) => !main.verbs.has(v)),
  };
}

function compare(
  bin: string,
  main: Declared | undefined,
  local: Declared | undefined,
  installed: boolean,
): BinaryReport {
  const owner = main ?? local;
  return {
    bin,
    plugin: owner?.plugin ?? null,
    installed,
    newOnMain: main !== undefined && local === undefined,
    goneFromMain: main === undefined,
    ...verbDiff(main, local),
    verbs: owner === undefined ? [] : toVerbs(owner.verbs),
  };
}

export function compareTools(
  nodes: readonly PluginNode[],
  p: ToolsProbes,
  fetch: boolean,
): ToolsResult {
  if (fetch) {
    const r = p.git(["fetch", "origin", "main"]);
    if (r.code !== 0) {
      return { kind: "failed", message: `git fetch origin main failed: ${r.stderr.trim()}` };
    }
  }
  const main = readMain(p.git);
  if (typeof main === "string") {
    return { kind: "missing", message: main };
  }
  const local = readLocal(nodes);
  const installed = p.installed();
  const names = [...new Set([...main.keys(), ...installed])].sort();
  const binaries = names.map((bin) =>
    compare(bin, main.get(bin), local.get(bin), installed.has(bin)),
  );
  return { kind: "ok", report: { fetchedAt: lastFetch(p), fetched: fetch, binaries } };
}

function binaryLines(b: BinaryReport): string[] {
  const state = [
    b.installed ? "installed" : "not installed",
    ...(b.newOnMain ? ["new on main"] : []),
    ...(b.goneFromMain ? ["gone from main"] : []),
  ].join(", ");
  const owner = b.plugin === null ? "" : ` (${b.plugin})`;
  return [
    `${b.bin}${owner}: ${state}`,
    ...b.added.map((v) => `  + ${v.verb}: ${v.description} (added on main)`),
    ...b.removed.map((v) => `  - ${v} (removed on main)`),
    ...b.verbs.map((v) => `  ${v.verb}: ${v.description}`),
  ];
}

export function describeTools(r: ToolsReport): string[] {
  const when = r.fetchedAt ?? "never, as far as git records";
  const head = r.fetched
    ? `${MAIN} fetched just now (${when})`
    : `${MAIN} as last fetched: ${when}; network untouched, --fetch updates it`;
  return [head, ...r.binaries.flatMap(binaryLines)];
}
