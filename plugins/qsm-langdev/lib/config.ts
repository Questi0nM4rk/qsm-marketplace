// The repository's own gate selection: .qsm-langdev/gates.json.

import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { arrayOf } from "./json.ts";
import {
  isLanguage,
  LANGUAGE_TABLE,
  LANGUAGES,
  type Language,
  type LanguageInfo,
} from "./registry.ts";

const INTERPRETER_EXTENSION: Readonly<Record<string, string>> = {
  sh: ".sh",
  dash: ".sh",
  bash: ".bash",
  zsh: ".zsh",
  fish: ".fish",
  python: ".py",
  node: ".js",
  bun: ".js",
  deno: ".js",
};

const SHEBANG_BYTES = 256;

function firstLine(path: string): string | null {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return null;
  }
  try {
    const buffer = Buffer.alloc(SHEBANG_BYTES);
    const read = readSync(fd, buffer, 0, SHEBANG_BYTES, 0);
    const text = buffer.toString("utf8", 0, read);
    const end = text.indexOf("\n");
    return end === -1 ? text : text.slice(0, end);
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

/**
 * The extension a shebang line stands for: `#!/bin/bash`, `#!/usr/bin/env bash`, `#!/usr/bin/env
 * -S bash -eu`, `python3.12`.
 */
function shebangExtension(line: string): string | null {
  if (!line.startsWith("#!")) {
    return null;
  }
  const words = line.slice(2).trim().split(/\s+/);
  let interpreter = basename(words[0] ?? "");
  if (interpreter === "env") {
    interpreter = words.slice(1).find((word) => !word.startsWith("-")) ?? "";
  }
  const normalised = interpreter.replace(/^python[\d.]*$/, "python");
  return INTERPRETER_EXTENSION[normalised] ?? null;
}

/** True when the file's name carries no extension at all: `bin/deploy`,
 * `Makefile`. A dotfile counts as having one. */
function hasNoExtension(file: string): boolean {
  return !basename(file).includes(".");
}

/**
 * The paths in `files` (relative to `root`) matching one of `extensions`: by suffix, by a base
 * name `names` matches, plus an extensionless file whose shebang names a covered interpreter.
 */
export function matchingFiles(
  root: string,
  files: readonly string[],
  extensions: readonly string[],
  names?: RegExp,
): string[] {
  return files.filter((file) => {
    if (extensions.some((suffix) => file.endsWith(suffix))) {
      return true;
    }
    if (names?.test(basename(file)) === true) {
      return true;
    }
    if (!hasNoExtension(file)) {
      return false;
    }
    const line = firstLine(join(root, file));
    const ext = line === null ? null : shebangExtension(line);
    return ext !== null && extensions.includes(ext);
  });
}

/** A NUL-separated git listing as paths, or null when git could not answer. */
export function gitPaths(root: string, args: readonly string[], input?: string): string[] | null {
  const result = spawnSync("git", args, {
    cwd: root,
    ...(input === undefined ? {} : { input }),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.split("\0").filter((path) => path.length > 0);
}

/** The paths among `paths` whose git attribute `attr` has one of `values`. */
export function pathsWithAttr(
  root: string,
  attr: string,
  values: readonly string[],
  paths: readonly string[],
): Set<string> {
  const found = new Set<string>();
  if (paths.length === 0) {
    return found;
  }
  const fields = gitPaths(root, ["check-attr", "-z", "--stdin", attr], paths.join("\0")) ?? [];
  for (let at = 0; at + 2 < fields.length; at += 3) {
    const [path, , value] = fields.slice(at, at + 3);
    if (path !== undefined && value !== undefined && values.includes(value)) {
      found.add(path);
    }
  }
  return found;
}

/** The paths among `paths` that `.gitattributes` marks generated: the one definition of
 * "generated" here, the `linguist-generated` attribute the repository already carries. */
export function generatedPaths(root: string, paths: readonly string[]): Set<string> {
  return pathsWithAttr(root, "linguist-generated", ["set", "true"], paths);
}

/**
 * Every tracked path plus untracked-and-not-ignored, minus anything the repository does not have
 * (generated or vendored trees .gitignore hides never turn a language on).
 */
export function repoFiles(root: string): string[] | null {
  const tracked = gitPaths(root, ["ls-files", "-z"]);
  const untracked = gitPaths(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (tracked === null || untracked === null) {
    return null;
  }
  return [...tracked, ...untracked];
}

/** Languages that never toggle (`alwaysOn` in LANGUAGE_TABLE): docs, multi. */
const ALWAYS_ON: readonly Language[] = LANGUAGES.filter(
  (language) => (LANGUAGE_TABLE[language] as LanguageInfo).alwaysOn,
);

/** True when a language never toggles, so gates.json naming it would claim
 * a control that is not there. */
export function alwaysOn(language: Language): boolean {
  return ALWAYS_ON.includes(language);
}

/**
 * True when a checker's language runs: an always-on language always does; any other one runs only
 * when gates.json names it.
 */
export function languageEnabled(language: Language, enabled: readonly Language[]): boolean {
  return ALWAYS_ON.includes(language) || enabled.includes(language);
}

/** The languages whose `detects` extensions `files` match, by name or by
 * shebang, plus the always-on ones. */
function languagesIn(root: string, files: readonly string[]): Language[] {
  return LANGUAGES.filter((language) => {
    const info: LanguageInfo = LANGUAGE_TABLE[language];
    if (info.alwaysOn) {
      return true;
    }
    return matchingFiles(root, files, info.detects ?? []).length > 0;
  });
}

/** The languages the repository holds, read bottom-up from its files. Null
 * when git could not answer. */
export function detectLanguages(root: string): Language[] | null {
  const files = repoFiles(root);
  return files === null ? null : languagesIn(root, files);
}

export interface GatesConfig {
  hooks: { "pre-commit": string[]; "pre-push": string[] };
  /** Opt-in: a language gates only when named here (the always-on languages gate regardless). */
  languages: Language[];
  /** The scaffolded profile `init` last recorded; absent until init runs. */
  profile?: string;
  /** What a language's code runs on, when it is not the language's default: `{ ts: "browser" }`. */
  targets?: Record<string, string>;
}

const DEFAULT_CONFIG: GatesConfig = {
  hooks: { "pre-commit": [], "pre-push": [] },
  languages: [],
};

function configPath(repoRoot: string): string {
  return join(repoRoot, ".qsm-langdev", "gates.json");
}

/** True when `repoRoot` has run `qsm-langdev init` at least once: its own gates.json is on disk. */
export function isLangdevRepo(repoRoot: string): boolean {
  return existsSync(configPath(repoRoot));
}

function knownLanguages(value: unknown): Language[] {
  return (arrayOf(value) ?? []).filter((name): name is Language => isLanguage(name));
}

/** The repository's gate selection, or the default when it has written none. */
export function readGatesConfig(repoRoot: string): GatesConfig {
  const path = configPath(repoRoot);
  if (!existsSync(path)) {
    return DEFAULT_CONFIG;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return DEFAULT_CONFIG;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_CONFIG;
  }
  const raw = parsed as Partial<GatesConfig>;
  return {
    hooks: {
      "pre-commit": raw.hooks?.["pre-commit"] ?? DEFAULT_CONFIG.hooks["pre-commit"],
      "pre-push": raw.hooks?.["pre-push"] ?? DEFAULT_CONFIG.hooks["pre-push"],
    },
    languages: knownLanguages(raw.languages),
    ...(raw.targets === undefined ? {} : { targets: raw.targets }),
    ...(typeof raw.profile === "string" ? { profile: raw.profile } : {}),
  };
}

export function writeGatesConfig(repoRoot: string, config: GatesConfig): void {
  const path = configPath(repoRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

/** The repository root of `start`, or null when it is not inside a git
 * checkout. */
export function findRepoRoot(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}
