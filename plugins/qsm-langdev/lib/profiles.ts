// Scaffolded per-tool configs.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROFILE_DATA } from "./profiles-data.ts";
import { isConfigless, LANGUAGES, type Language } from "./registry.ts";

function listProfiles(): string[] {
  return Object.keys(PROFILE_DATA).sort();
}

interface ProfileFile {
  language: Language;
  file: string;
  content: string;
}

/**
 * The files one profile ships for one language: the language's own, then the named target's on
 * top, a target file replacing the base file of the same name.
 */
function filesFor(
  table: Readonly<Record<string, readonly { file: string; content: string }[]>>,
  language: Language,
  target: string | undefined,
): { file: string; content: string }[] {
  const base = [...(table[language] ?? [])];
  if (target === undefined) {
    return base;
  }
  const overlay = table[`${language}@${target}`] ?? [];
  const byName = new Map(base.map((entry) => [entry.file, entry]));
  for (const entry of overlay) {
    byName.set(entry.file, entry);
  }
  return [...byName.values()];
}

/** The files one profile ships for `languages`, in LANGUAGE_TABLE order. A
 * language with nothing embedded for this profile ships nothing. */
function profileFiles(
  profile: string,
  languages: readonly Language[],
  targets: Readonly<Record<string, string>> = {},
): ProfileFile[] {
  const table = PROFILE_DATA[profile];
  if (table === undefined) {
    return [];
  }
  const out: ProfileFile[] = [];
  for (const language of LANGUAGES) {
    if (!languages.includes(language)) {
      continue;
    }
    for (const entry of filesFor(table, language, targets[language])) {
      out.push({ language, ...entry });
    }
  }
  return out;
}

/** Whether `root` already carries a config file this or any shipped profile
 * would put there for `language` — the check that stands behind "a selected
 * language has no scaffolded config": a language declared configless always
 * passes, since there is nothing to scaffold. */
export function hasScaffoldedConfig(root: string, language: Language): boolean {
  if (isConfigless(language)) {
    return true;
  }
  const names = new Set<string>();
  for (const profile of listProfiles()) {
    for (const entry of profileFiles(profile, [language])) {
      names.add(entry.file);
    }
  }
  if (names.size === 0) {
    return true; // no profile ships anything for this language at all
  }
  return [...names].some((name) => existsSync(join(root, name)));
}

/**
 * Languages the registry gates that no profile ships a config for, and that have not declared
 * themselves configless — scored under a tool's own defaults, which is not a ruleset a repository
 * agreed to.
 */
export function profileGaps(): string[] {
  const gaps: string[] = [];
  for (const profile of listProfiles()) {
    for (const language of LANGUAGES) {
      if (isConfigless(language)) {
        continue;
      }
      if (profileFiles(profile, [language]).length > 0) {
        continue;
      }
      gaps.push(`${profile}/${language}: no config shipped, so its checkers run at tool defaults`);
    }
  }
  return gaps;
}

export interface ScaffoldAction {
  file: string;
  language: Language;
  /** `stale` is a kept file that is verbatim another profile's version of
   * itself, so it is not the repository's own config: it is the one a
   * different profile seeded, still governing a repository that has since
   * moved on. That names the profile it came from. */
  status: "written" | "same" | "kept" | "stale";
  from?: string;
}

/**
 * The profile whose version of `file` the bytes on disk are, when some profile's is an exact match
 * and it is not `mine`.
 */
function seededByAnotherProfile(
  mine: string,
  file: string,
  onDisk: string,
  languages: readonly Language[],
): string | undefined {
  for (const profile of listProfiles()) {
    if (profile === mine) {
      continue;
    }
    const theirs = profileFiles(profile, languages).find((entry) => entry.file === file);
    if (theirs !== undefined && theirs.content === onDisk) {
      return profile;
    }
  }
  return undefined;
}

/**
 * Writes `profile`'s files for `languages` into the repository root: a missing file is written, an
 * identical one is reported `same`, a differing one is left as the repo's own and reported `kept`.
 */
export function scaffoldProfile(
  root: string,
  profile: string,
  languages: readonly Language[],
  targets: Readonly<Record<string, string>> = {},
): ScaffoldAction[] {
  const known = listProfiles();
  if (!known.includes(profile)) {
    throw new Error(`unknown profile '${profile}' (known: ${known.join(", ")})`);
  }
  const actions: ScaffoldAction[] = [];
  for (const { language, file, content } of profileFiles(profile, languages, targets)) {
    const target = join(root, file);
    if (!existsSync(target)) {
      writeFileSync(target, content);
      actions.push({ file, language, status: "written" });
    } else if (readFileSync(target, "utf8") === content) {
      actions.push({ file, language, status: "same" });
    } else {
      const onDisk = readFileSync(target, "utf8");
      const from = seededByAnotherProfile(profile, file, onDisk, languages);
      if (from === undefined) {
        actions.push({ file, language, status: "kept" });
      } else {
        actions.push({ file, language, status: "stale", from });
      }
    }
  }
  return actions;
}
