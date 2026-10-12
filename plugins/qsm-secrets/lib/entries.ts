// The browsing verbs, as pure functions over `rbw list --fields name,folder,user` output.

import { WRAPPER_MARK } from "./vault.ts";

export interface Entry {
  readonly name: string;
  readonly folder: string;
  readonly user: string;
}

const LOWEST_PRINTABLE = 0x20;
const DELETE_CHAR = 0x7f;
const HIGHEST_C1 = 0x9f;

/**
 * A field carrying a control byte is dropped rather than printed: this output is read in a
 * terminal, and an escape sequence inside a vault field could redraw the lines around it.
 */
function hasControlCharacter(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < LOWEST_PRINTABLE || (code >= DELETE_CHAR && code <= HIGHEST_C1)) {
      return true;
    }
  }
  return false;
}

/** Tab-separated rows into entries. */
export function parseEntries(stdout: string): Entry[] {
  const entries: Entry[] = [];
  for (const line of stdout.split("\n")) {
    const parts = line.split("\t");
    const [name, folder, user] = parts;
    if (parts.length !== 3 || name === undefined || folder === undefined || user === undefined) {
      continue;
    }
    if (hasControlCharacter(name) || hasControlCharacter(folder) || hasControlCharacter(user)) {
      continue;
    }
    entries.push({ name, folder, user });
  }
  return entries;
}

/** The empty namespace is the whole vault, matched by entry name alone. */
function inNamespace(entry: Entry, namespace: string): boolean {
  return namespace === "" || entry.folder === namespace;
}

/** Whether the namespace holds an entry under exactly this name. */
export function keyExists(entries: readonly Entry[], namespace: string, key: string): boolean {
  return entries.some((entry) => inNamespace(entry, namespace) && entry.name === key);
}

/** `list`: the key names this wrapper stored, sorted, no duplicates. */
export function storedKeys(entries: readonly Entry[], namespace: string): string[] {
  const names = entries
    .filter((entry) => inNamespace(entry, namespace) && entry.user === WRAPPER_MARK)
    .map((entry) => entry.name);
  return [...new Set(names)].sort();
}

export interface Metadata {
  readonly name: string;
  readonly user: string;
  readonly folder: string;
  /** "qsm-secrets" when this wrapper stored it, "other" otherwise. */
  readonly storedBy: string;
}

/** `inspect`: every entry in the namespace, whoever stored it, as the
 * three fields the vault exposes beside the password. */
export function namespaceMetadata(entries: readonly Entry[], namespace: string): Metadata[] {
  return entries
    .filter((entry) => inNamespace(entry, namespace))
    .map((entry) => ({
      name: entry.name,
      user: entry.user,
      folder: entry.folder,
      storedBy: entry.user === WRAPPER_MARK ? WRAPPER_MARK : "other",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function formatMetadata(namespace: string, rows: readonly Metadata[]): string {
  const label = namespace === "" ? "(whole vault)" : namespace;
  const blocks = rows.map((row) =>
    [
      `name: ${row.name}`,
      `user: ${row.user === "" ? "(none)" : row.user}`,
      `folder: ${row.folder === "" ? "(none)" : row.folder}`,
      `stored-by: ${row.storedBy}`,
    ].join("\n"),
  );
  return [`namespace: ${label}`, ...blocks].join("\n\n");
}
