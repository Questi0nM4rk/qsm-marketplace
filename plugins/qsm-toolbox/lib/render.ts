// The skill is generated text checked against the table by a test, not prose somebody keeps in step
// by hand.

import { QSM_BINS, TOOLS } from "./catalog.ts";

/** The clause before the list: it says when to invoke and nothing else. */
const LEAD = "CLI tools on this machine, invoke for caveats.";

/** An entry's parenthesis holds at most this many words. Past it the
 * always-loaded cost stops being a fixed small number. */
export const MAX_BLURB_WORDS = 4;

export function blurbWords(blurb: string): number {
  return blurb.split(/\s+/).filter((word) => word.length > 0).length;
}

function entries(items: readonly { bin: string; blurb: string }[]): string {
  return items.map((item) => `${item.bin} (${item.blurb})`).join(", ");
}

/** The skill's frontmatter description: the whole index, in two groups. */
export function describe(): string {
  return `${LEAD} Third-party: ${entries(TOOLS)}. qsm: ${entries(QSM_BINS)}.`;
}

/** A pipe inside a cell ends the cell, and one install line is a shell pipe. */
function row(cells: readonly string[]): string {
  return `| ${cells.map((cell) => cell.replaceAll("|", "\\|")).join(" | ")} |`;
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const divider = headers.map(() => "---");
  return [row(headers), row(divider), ...rows.map(row)].join("\n");
}

/** One row per tool that has a caveat of ours. A tool with nothing to add has no row: its own
 * help says the rest, and doctor prints the install line when it is missing. */
export function caveatTable(): string {
  return table(
    ["Tool", "Our caveat"],
    TOOLS.flatMap((tool) => (tool.caveat === null ? [] : [[`\`${tool.bin}\``, tool.caveat]])),
  );
}
