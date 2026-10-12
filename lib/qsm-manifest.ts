// qsm.json, the one source of truth for a plugin's binaries and their verbs.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type ArgType = "string" | "number" | "boolean";

export interface CommandArg {
  /** camelCase; a flag is `--kebab-case` on the command line */
  readonly name: string;
  readonly type: ArgType;
  readonly positional?: true;
  readonly required?: true;
  /** every occurrence is collected into a list (a flag or a positional) */
  readonly repeatable?: true;
  /** the only values accepted */
  readonly choices?: readonly string[];
  readonly description: string;
}

export interface CommandDecl {
  readonly description: string;
  readonly args?: readonly CommandArg[];
  /** everything after `--` reaches the handler untouched */
  readonly passthrough?: true;
  /**
   * the verb is reached from a shell only, never as a noun method: it carries a value or a stream
   * that has no JSON form.
   */
  readonly noNoun?: true;
}

export interface QsmManifest {
  readonly name?: string;
  readonly qsm: {
    /** bin name -> entry script, relative to the plugin root */
    readonly bin?: Readonly<Record<string, string>>;
    readonly noun?: string;
    /** "<bin> <verb>" -> its declaration */
    readonly commands: Readonly<Record<string, CommandDecl>>;
  };
}

export function loadManifest(pluginRoot: string): QsmManifest {
  return JSON.parse(readFileSync(resolve(pluginRoot, "qsm.json"), "utf8")) as QsmManifest;
}

/** The verbs of one binary, in declaration order: "qsm-memory recall" -> "recall". */
export function verbsOf(manifest: QsmManifest, bin: string): ReadonlyMap<string, CommandDecl> {
  const prefix = `${bin} `;
  const verbs = new Map<string, CommandDecl>();
  for (const [key, decl] of Object.entries(manifest.qsm.commands)) {
    if (key.startsWith(prefix)) {
      verbs.set(key.slice(prefix.length), decl);
    }
  }
  return verbs;
}

/** The words at the start of argv, up to the first flag. */
function leadingWords(argv: readonly string[]): string[] {
  const end = argv.findIndex((t) => t.startsWith("-"));
  return [...(end === -1 ? argv : argv.slice(0, end))];
}

/** The longest declared verb at the start of argv, and the arguments after
 * it: ["toon", "encode", "a.json"] -> "toon encode" + ["a.json"]. */
export function matchVerb(
  verbs: ReadonlyMap<string, CommandDecl>,
  argv: readonly string[],
): { readonly verb: string; readonly tail: readonly string[] } | null {
  const words = leadingWords(argv);
  for (let n = words.length; n > 0; n -= 1) {
    const verb = words.slice(0, n).join(" ");
    if (verbs.has(verb)) {
      return { verb, tail: argv.slice(n) };
    }
  }
  return null;
}

/** The verbs under a group, in declaration order: "toon" -> ["toon encode", ...]. */
export function groupVerbs(verbs: ReadonlyMap<string, CommandDecl>, group: string): string[] {
  return [...verbs.keys()].filter((v) => v.startsWith(`${group} `));
}

/** The longest group at the start of argv, or null: ["toon", "squash"] -> "toon". */
export function matchGroup(
  verbs: ReadonlyMap<string, CommandDecl>,
  argv: readonly string[],
): string | null {
  const words = leadingWords(argv);
  for (let n = words.length; n > 0; n -= 1) {
    const group = words.slice(0, n).join(" ");
    if (groupVerbs(verbs, group).length > 0) {
      return group;
    }
  }
  return null;
}

/** camelCase -> kebab-case ("fromStdin" -> "from-stdin"). */
export function toKebab(camel: string): string {
  return camel.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** kebab-case -> camelCase ("stage-session" -> "stageSession"). */
export function toCamel(kebab: string): string {
  return kebab.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
