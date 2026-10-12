// What a person reads when they did not ask for --json.

export interface Column {
  readonly header: string;
  readonly width: number;
}

const ELLIPSIS = "…";

/** One line, at most `width` wide, newlines folded away: a review comment
 * is a paragraph and a table cell is not. */
export function oneLine(text: string, width: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= width ? flat : `${flat.slice(0, width - 1)}${ELLIPSIS}`;
}

function pad(cell: string, width: number): string {
  return cell.length >= width ? cell.slice(0, width) : cell + " ".repeat(width - cell.length);
}

/** A fixed-width table as lines, header and rule included. Returns lines
 * rather than printing them, so the caller owns the output stream. */
export function table(columns: readonly Column[], rows: readonly (readonly string[])[]): string[] {
  const widthAt = (index: number) => columns.at(index)?.width ?? 10;
  const lines = [
    columns.map((column) => pad(column.header, column.width)).join("  "),
    columns.map((column) => "-".repeat(column.width)).join("  "),
  ];
  for (const row of rows) {
    lines.push(row.map((cell, index) => pad(cell, widthAt(index))).join("  "));
  }
  return lines;
}

/** `path:line`, or `path` when the thread hangs off no line. */
export function place(path: string, line: number | null): string {
  if (path.length === 0) {
    return "(no file)";
  }
  return line === null ? path : `${path}:${String(line)}`;
}
