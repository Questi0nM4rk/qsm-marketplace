// What the vault requires of a note, as a check over the note's own text: the four frontmatter
// fields, a type the vault knows, an ISO date, lowercase hyphenated tags, and a link out.

import { readFileSync, statSync } from "node:fs";

const NOTE_TYPES = ["til", "concept", "project", "debug", "research-summary", "index"] as const;

const REQUIRED_FIELDS = ["title", "created", "type", "tags"] as const;

export type FrontmatterValue = string | readonly string[];

export interface NoteCheck {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface NoteReport extends NoteCheck {
  readonly file: string;
  readonly ok: boolean;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WIKILINK = /\[\[[^\]]+\]\]/;
const QUOTED = /^(?:"(.*)"|'(.*)')$/s;
const WHITESPACE = /\s/;
const BLOCK_ENTRY = /^\s+-\s+(.+)$/;

function unquote(raw: string): string {
  const value = raw.trim();
  const quoted = QUOTED.exec(value);
  return quoted?.[1] ?? quoted?.[2] ?? value;
}

function parseValue(raw: string): FrontmatterValue {
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map(unquote)
      .filter((entry) => entry.length > 0);
  }
  return unquote(raw);
}

/** The frontmatter block as field to value, or null when the file does not open with one. */
export function parseFrontmatter(text: string): Record<string, FrontmatterValue> | null {
  const block = FRONTMATTER.exec(text)?.[1];
  if (block === undefined) {
    return null;
  }
  const fields: Record<string, FrontmatterValue> = {};
  // The key an indented `- value` line belongs to: the last key written with
  // nothing after the colon. Any other line closes the sequence.
  let openKey: string | null = null;
  for (const line of block.split(/\r?\n/)) {
    const entry = BLOCK_ENTRY.exec(line);
    if (openKey !== null && entry?.[1] !== undefined) {
      const collected = fields[openKey];
      fields[openKey] = Array.isArray(collected)
        ? [...collected, unquote(entry[1])]
        : [unquote(entry[1])];
      continue;
    }
    const separator = line.indexOf(":");
    if (separator === -1 || line.startsWith(" ")) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    if (key.length === 0) {
      continue;
    }
    const raw = line.slice(separator + 1).trim();
    fields[key] = parseValue(raw);
    openKey = raw.length === 0 ? key : null;
  }
  return fields;
}

function isEmpty(value: FrontmatterValue | undefined): boolean {
  return value === undefined || value.length === 0;
}

function checkType(value: FrontmatterValue | undefined): string[] {
  if (isEmpty(value) || typeof value !== "string") {
    // Missing is already an error from the required-field pass, and a list
    // under `type` is the same defect seen twice.
    return isEmpty(value) ? [] : [`type must be one of: ${NOTE_TYPES.join(", ")}`];
  }
  return (NOTE_TYPES as readonly string[]).includes(value)
    ? []
    : [`unknown type "${value}": one of ${NOTE_TYPES.join(", ")}`];
}

function checkCreated(value: FrontmatterValue | undefined): string[] {
  if (isEmpty(value) || typeof value !== "string") {
    return [];
  }
  return ISO_DATE.test(value) ? [] : [`created must be YYYY-MM-DD, got "${value}"`];
}

function checkTags(value: FrontmatterValue | undefined): string[] {
  if (isEmpty(value)) {
    // Missing, `tags:` with nothing under it, and `tags: []` are all the same
    // defect, and the required-field pass already names it.
    return [];
  }
  if (!Array.isArray(value)) {
    return ["tags must be a list, written as [one, two] or as indented - entries"];
  }
  const tags: readonly string[] = value;
  const found: string[] = [];
  for (const tag of tags) {
    if (tag !== tag.toLowerCase()) {
      found.push(`tag "${tag}" must be lowercase`);
    }
    if (WHITESPACE.test(tag)) {
      found.push(`tag "${tag}" must be hyphenated, not spaced`);
    }
  }
  return found;
}

/** Every problem in one note's text. */
export function checkNote(text: string): NoteCheck {
  const fields = parseFrontmatter(text);
  if (fields === null) {
    return {
      errors: ["no YAML frontmatter: the note must open with --- and close the block with ---"],
      warnings: [],
    };
  }
  const errors: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (isEmpty(fields[field])) {
      errors.push(`missing required frontmatter field: ${field}`);
    }
  }
  errors.push(
    ...checkType(fields.type),
    ...checkCreated(fields.created),
    ...checkTags(fields.tags),
  );
  const body = text.replace(FRONTMATTER, "");
  const warnings = WIKILINK.test(body)
    ? []
    : ["no [[wikilink]] in the body: an atomic note links to at least one other note"];
  return { errors, warnings };
}

/** The check plus the file it came from. */
export function validateFile(path: string): NoteReport {
  let isFile: boolean;
  try {
    isFile = statSync(path).isFile();
  } catch {
    return { file: path, ok: false, errors: [`no file at ${path}`], warnings: [] };
  }
  if (!isFile) {
    return { file: path, ok: false, errors: [`not a file: ${path}`], warnings: [] };
  }
  const check = checkNote(readFileSync(path, "utf8"));
  return { file: path, ok: check.errors.length === 0, ...check };
}
