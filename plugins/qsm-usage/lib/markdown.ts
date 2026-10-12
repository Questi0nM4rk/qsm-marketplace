// Two things worth pulling out of a Markdown file: the YAML block at the top, and one pipe table
// under a named heading.

import { YAML } from "bun";
import { InputError, messageOf } from "./formats.ts";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const HEADING = /^#+\s/;

/** The YAML block between the leading `---` delimiters. */
export function extractFrontmatter(source: string): unknown {
  const block = FRONTMATTER.exec(source)?.[1];
  if (block === undefined) {
    throw new InputError("no YAML frontmatter block found (expected --- delimiters at file start)");
  }
  try {
    return YAML.parse(block);
  } catch (error) {
    throw new InputError(`cannot parse the frontmatter block as YAML: ${messageOf(error)}`, {
      cause: error,
    });
  }
}

/** The raw frontmatter text, for a size comparison against its encoding. */
export function frontmatterText(source: string): string {
  return FRONTMATTER.exec(source)?.[1] ?? source;
}

export function headings(source: string): string[] {
  const found: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    if (HEADING.test(line)) {
      found.push(line.replace(/^#+\s*/, "").trim());
    }
  }
  return found;
}

function splitRow(line: string): string[] {
  const cells = line.trim().split("|");
  return cells.slice(1, cells.length - 1).map((cell) => cell.trim());
}

/** The lines of the first pipe table under `heading`, exactly as the file writes them. */
function tableLines(source: string, heading: string): string[] {
  const lines = source.split(/\r?\n/);
  const wanted = heading.trim().toLowerCase();
  const start = lines.findIndex(
    (line) =>
      HEADING.test(line) &&
      line
        .replace(/^#+\s*/, "")
        .trim()
        .toLowerCase() === wanted,
  );
  if (start === -1) {
    const available = headings(source);
    throw new InputError(
      `heading "${heading}" not found. Headings in this file: ${available.join(", ") || "(none)"}`,
    );
  }
  const table: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (HEADING.test(line)) {
      break;
    }
    if (line.trim().startsWith("|")) {
      table.push(line);
    } else if (table.length > 0) {
      break;
    }
  }
  if (table.length < 2) {
    throw new InputError(`no pipe table under heading "${heading}"`);
  }
  return table;
}

/** The raw table text, so a size comparison measures the encoding against
 * what the file actually holds rather than against a re-serialisation of it. */
export function tableText(source: string, heading: string): string {
  return tableLines(source, heading).join("\n");
}

/** The first pipe table under `heading`, as one object per body row. */
export function extractTable(source: string, heading: string): Record<string, string>[] {
  const table = tableLines(source, heading);
  const columns = splitRow(table[0] ?? "");
  const rows: Record<string, string>[] = [];
  for (const line of table.slice(2)) {
    const cells = splitRow(line);
    const row: Record<string, string> = {};
    for (let c = 0; c < columns.length; c += 1) {
      row[columns[c] ?? ""] = cells[c] ?? "";
    }
    rows.push(row);
  }
  return rows;
}
