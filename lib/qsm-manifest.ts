// qsm.json, the one source of truth for a plugin's binaries and their verbs.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const commandArgSchema = z.object({
  /** camelCase; a flag is `--kebab-case` on the command line */
  name: z.string(),
  type: z.enum(["string", "number", "boolean"]),
  positional: z.literal(true).optional(),
  required: z.literal(true).optional(),
  /** every occurrence is collected into a list (a flag or a positional) */
  repeatable: z.literal(true).optional(),
  /** the only values accepted */
  choices: z.array(z.string()).readonly().optional(),
  description: z.string(),
});

const commandDeclSchema = z.object({
  description: z.string(),
  args: z.array(commandArgSchema).readonly().optional(),
  /** everything after `--` reaches the handler untouched */
  passthrough: z.literal(true).optional(),
  /**
   * the verb is reached from a shell only, never as a noun method: it carries a value or a stream
   * that has no JSON form.
   */
  noNoun: z.literal(true).optional(),
});

const manifestSchema = z.object({
  name: z.string().optional(),
  qsm: z.object({
    /** bin name -> entry script, relative to the plugin root */
    bin: z.record(z.string(), z.string()).optional(),
    noun: z.string().optional(),
    /** "<bin> <verb>" -> its declaration */
    commands: z.record(z.string(), commandDeclSchema),
  }),
});

export type CommandArg = z.infer<typeof commandArgSchema>;
export type CommandDecl = z.infer<typeof commandDeclSchema>;
export type QsmManifest = z.infer<typeof manifestSchema>;

/** Checks the shape of a parsed qsm.json and returns it typed; throws a ZodError naming the field. */
export function parseManifest(raw: unknown): QsmManifest {
  return manifestSchema.parse(raw);
}

export function loadManifest(pluginRoot: string): QsmManifest {
  const raw: unknown = JSON.parse(readFileSync(resolve(pluginRoot, "qsm.json"), "utf8"));
  return parseManifest(raw);
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
  return camel.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** kebab-case -> camelCase ("stage-session" -> "stageSession"). */
export function toCamel(kebab: string): string {
  return kebab.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
