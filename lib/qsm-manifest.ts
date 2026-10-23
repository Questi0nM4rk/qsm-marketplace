// qsm.json, the one source of truth for a plugin's binaries and their verbs.
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, normalize, resolve, sep } from "node:path";

export interface CommandArg {
  /** camelCase; a flag is `--kebab-case` on the command line */
  readonly name: string;
  readonly type: "string" | "number" | "boolean";
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
   * the verb is reached from a shell only, never as a noun method: it carries a value or a
   * stream that has no JSON form.
   */
  readonly noNoun?: true;
}

export interface QsmManifest {
  readonly name?: string;
  readonly qsm: {
    /** bin name -> entry script, relative to the plugin root */
    readonly bin?: Readonly<Record<string, string>>;
    /** helper basename -> source file relative to this plugin, not a compiled CLI */
    readonly links?: Readonly<Record<string, string>>;
    readonly noun?: string;
    /** a shell command that reports whether the plugin's upstream tools are present */
    readonly doctor?: string;
    /** "<bin> <verb>" -> its declaration */
    readonly commands: Readonly<Record<string, CommandDecl>>;
  };
}

/** A qsm.json that does not have the shape the parser and the generators read. */
export class ManifestError extends Error {}

/** Where a reader stands in one qsm.json: the file and the dotted field. */
interface At {
  readonly file: string;
  readonly field: string;
}

const at = (parent: At, key: string | number): At => ({
  file: parent.file,
  field: parent.field === "" ? String(key) : `${parent.field}.${key}`,
});

function fail(where: At, expected: string): never {
  throw new ManifestError(`${where.file}: ${where.field || "(root)"}: expected ${expected}`);
}

/** A JSON object: not null, not an array. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readRecord(v: unknown, where: At): Record<string, unknown> {
  return isRecord(v) ? v : fail(where, "an object");
}

function readString(v: unknown, where: At): string {
  return typeof v === "string" ? v : fail(where, "a string");
}

function readOptString(v: unknown, where: At): string | undefined {
  return v === undefined ? undefined : readString(v, where);
}

function readOptTrue(v: unknown, where: At): true | undefined {
  return v === undefined || v === true ? v : fail(where, "true or absent");
}

function readList(v: unknown, where: At): unknown[] | undefined {
  return v === undefined || Array.isArray(v) ? v : fail(where, "a list");
}

function readArg(v: unknown, where: At): CommandArg {
  const r = readRecord(v, where);
  const type = r["type"];
  if (type !== "string" && type !== "number" && type !== "boolean") {
    return fail(at(where, "type"), '"string", "number" or "boolean"');
  }
  const positional = readOptTrue(r["positional"], at(where, "positional"));
  const required = readOptTrue(r["required"], at(where, "required"));
  const repeatable = readOptTrue(r["repeatable"], at(where, "repeatable"));
  const choices = readList(r["choices"], at(where, "choices"));
  return {
    name: readString(r["name"], at(where, "name")),
    type,
    ...(positional && { positional }),
    ...(required && { required }),
    ...(repeatable && { repeatable }),
    ...(choices && {
      choices: choices.map((c, i) => readString(c, at(at(where, "choices"), i))),
    }),
    description: readString(r["description"], at(where, "description")),
  };
}

function readDecl(v: unknown, where: At): CommandDecl {
  const r = readRecord(v, where);
  const args = readList(r["args"], at(where, "args"));
  const passthrough = readOptTrue(r["passthrough"], at(where, "passthrough"));
  const noNoun = readOptTrue(r["noNoun"], at(where, "noNoun"));
  return {
    description: readString(r["description"], at(where, "description")),
    ...(args && { args: args.map((a, i) => readArg(a, at(at(where, "args"), i))) }),
    ...(passthrough && { passthrough }),
    ...(noNoun && { noNoun }),
  };
}

function readBin(v: unknown, where: At): Record<string, string> {
  const r = readRecord(v, where);
  return Object.fromEntries(Object.entries(r).map(([k, x]) => [k, readString(x, at(where, k))]));
}

function readLinks(v: unknown, where: At): Record<string, string> {
  const links = readBin(v, where);
  for (const [name, source] of Object.entries(links)) {
    if (name === "" || name === "." || name === ".." || /[/\\\0]/.test(name)) {
      fail(at(where, name), "a nonempty bin basename");
    }
    const path = normalize(source);
    if (source === "" || isAbsolute(source) || path === ".." || path.startsWith(`..${sep}`)) {
      fail(at(where, name), "a relative source path confined to the plugin");
    }
  }
  return links;
}

/** Checks every field of a parsed qsm.json and returns it typed; throws a ManifestError naming
 * the file and the first field that is wrong. */
export function parseManifest(raw: unknown, file = "qsm.json"): QsmManifest {
  const root = readRecord(raw, { file, field: "" });
  const where = at({ file, field: "" }, "qsm");
  const qsm = readRecord(root["qsm"], where);
  const commands = readRecord(qsm["commands"], at(where, "commands"));
  const name = readOptString(root["name"], { file, field: "name" });
  const noun = readOptString(qsm["noun"], at(where, "noun"));
  const doctor = readOptString(qsm["doctor"], at(where, "doctor"));
  const bin = qsm["bin"] === undefined ? undefined : readBin(qsm["bin"], at(where, "bin"));
  const links =
    qsm["links"] === undefined ? undefined : readLinks(qsm["links"], at(where, "links"));
  for (const helper of Object.keys(links ?? {})) {
    if (bin?.[helper] !== undefined) {
      fail(at(at(where, "links"), helper), "a helper name not declared as a compiled bin");
    }
  }
  return {
    ...(name !== undefined && { name }),
    qsm: {
      ...(bin !== undefined && { bin }),
      ...(links !== undefined && { links }),
      ...(noun !== undefined && { noun }),
      ...(doctor !== undefined && { doctor }),
      commands: Object.fromEntries(
        Object.entries(commands).map(([k, d]) => [k, readDecl(d, at(at(where, "commands"), k))]),
      ),
    },
  };
}

export function loadManifest(pluginRoot: string): QsmManifest {
  const file = resolve(pluginRoot, "qsm.json");
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  const manifest = parseManifest(raw, file);
  for (const [name, source] of Object.entries(manifest.qsm.links ?? {})) {
    const path = resolve(pluginRoot, source);
    const where = { file, field: `qsm.links.${name}` };
    if (!existsSync(path) || !statSync(path).isFile()) {
      fail(where, `an existing source file (${source})`);
    }
    if (!realpathSync(path).startsWith(`${realpathSync(pluginRoot)}${sep}`)) {
      fail(where, "a source file confined to the plugin");
    }
  }
  return manifest;
}

/** The declaration of a verb that matchVerb or verbsOf already named; a missing one is a defect. */
export function declOf(verbs: ReadonlyMap<string, CommandDecl>, verb: string): CommandDecl {
  const decl = verbs.get(verb);
  if (decl === undefined) {
    throw new Error(`no declaration for verb "${verb}"`);
  }
  return decl;
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
  return camel.replaceAll(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** kebab-case -> camelCase ("stage-session" -> "stageSession"). */
export function toCamel(kebab: string): string {
  return kebab.replaceAll(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
