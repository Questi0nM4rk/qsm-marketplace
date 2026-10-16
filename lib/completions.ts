// Fish completions generated from qsm.json, never hand-kept. One file per
// binary, marked so we only ever overwrite our own.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CommandArg, type CommandDecl, declOf, toKebab } from "./qsm-manifest.ts";

export const MARKER = "qsm-generated-fish-completion";

function q(s: string): string {
  return `'${s.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

/** The condition that every word of a verb has been typed. */
function seenAll(verb: string): string {
  return verb
    .split(" ")
    .map((w) => `__fish_seen_subcommand_from ${w}`)
    .join("; and ");
}

function flagLine(bin: string, verb: string, arg: CommandArg): string {
  const parts = [`complete -c ${bin} -f -n ${q(seenAll(verb))} -l ${toKebab(arg.name)}`];
  if (arg.type !== "boolean") {
    parts.push("-r");
  }
  if (arg.choices !== undefined) {
    parts.push(`-a ${q(arg.choices.join(" "))}`);
  }
  parts.push(`-d ${q(arg.description)}`);
  return parts.join(" ");
}

function positionalChoicesLine(bin: string, verb: string, arg: CommandArg): string | null {
  return arg.choices === undefined
    ? null
    : `complete -c ${bin} -f -n ${q(seenAll(verb))} -a ${q(arg.choices.join(" "))} -d ${q(arg.description)}`;
}

/** The words that may follow `parent` (words already typed), each with its
 * description: a verb's own, or a group's list of what follows it. */
function nextWords(
  verbs: readonly string[],
  decls: ReadonlyMap<string, CommandDecl>,
  parent: string[],
) {
  const children = new Map<string, string>();
  for (const verb of verbs) {
    const words = verb.split(" ");
    if (
      words.length <= parent.length ||
      words.slice(0, parent.length).join(" ") !== parent.join(" ")
    ) {
      continue;
    }
    const word = words[parent.length];
    if (word === undefined) {
      continue;
    }
    const path = [...parent, word].join(" ");
    const group = verbs
      .filter((v) => v.startsWith(`${path} `))
      .map((v) => v.split(" ")[parent.length + 1]);
    children.set(word, decls.get(path)?.description ?? [...new Set(group)].join(", "));
  }
  return children;
}

/** The line offering `word` once every parent word is typed and no sibling is. */
function wordLine(
  bin: string,
  parent: string[],
  word: string,
  siblings: ReadonlyMap<string, string>,
): string {
  const condition =
    parent.length === 0
      ? "__fish_use_subcommand"
      : q(
          `${seenAll(parent.join(" "))}; and not __fish_seen_subcommand_from ${[...siblings.keys()].join(" ")}`,
        );
  return `complete -c ${bin} -f -n ${condition} -a ${q(word)} -d ${q(siblings.get(word) ?? "")}`;
}

/** One completion file for `bin` from every `<bin> <verb>` in `commands`:
 * each word offered where it may be typed (a group first, its verbs after
 * it), each flag as a long option needing every word of its verb (requiring
 * a value unless boolean), choices offered as candidates. */
export function fishCompletion(
  bin: string,
  commands: Readonly<Record<string, CommandDecl>>,
): string {
  const decls = new Map(
    Object.entries(commands)
      .filter(([key]) => key.startsWith(`${bin} `))
      .map(([key, decl]) => [key.slice(bin.length + 1), decl] as const),
  );
  const verbs = [...decls.keys()];
  const lines = [`# ${MARKER}`, `complete -c ${bin} -e`];
  const offered = new Set<string>();
  for (const verb of verbs) {
    const words = verb.split(" ");
    for (const [depth, word] of words.entries()) {
      const parent = words.slice(0, depth);
      const path = words.slice(0, depth + 1).join(" ");
      if (offered.has(path)) {
        continue;
      }
      offered.add(path);
      lines.push(wordLine(bin, parent, word, nextWords(verbs, decls, parent)));
    }
    const decl = declOf(decls, verb);
    for (const arg of decl.args ?? []) {
      const line =
        arg.positional === true ? positionalChoicesLine(bin, verb, arg) : flagLine(bin, verb, arg);
      if (line !== null) {
        lines.push(line);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

export type CompletionWrite = "written" | "unchanged" | "foreign";

/** Writes `<dir>/<bin>.fish`. A file there without our marker is the user's
 * own and is left untouched. */
export function writeCompletion(dir: string, bin: string, content: string): CompletionWrite {
  const target = join(dir, `${bin}.fish`);
  const current = existsSync(target) ? readFileSync(target, "utf8") : null;
  if (current !== null && !current.includes(MARKER)) {
    return "foreign";
  }
  if (current === content) {
    return "unchanged";
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(target, content);
  return "written";
}
