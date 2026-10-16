// The optional external converters.

import { onPath, type RequiredTool } from "../../../lib/outcome.ts";
import type { Reader } from "./sources.ts";

export interface Converter {
  /** the binary to look for on PATH */
  readonly command: string;
  /** the extensions it unlocks */
  readonly formats: readonly string[];
  /** what the user installs to get it */
  readonly install: string;
}

const CONVERTERS: readonly Converter[] = [
  { command: "pdftotext", formats: [".pdf"], install: "poppler (package poppler-utils)" },
  { command: "pandoc", formats: [".epub", ".docx", ".rtf"], install: "pandoc" },
  { command: "ebook-convert", formats: [".mobi", ".azw", ".azw3"], install: "calibre" },
];

/** The converters as doctor's upstream rows. Every one is optional: plain
 * text, Markdown and HTML convert with none of them. */
export const UPSTREAM: readonly RequiredTool[] = CONVERTERS.map((c) => ({
  cmd: c.command,
  hint: `install ${c.install} to read ${c.formats.join(" ")}`,
  optional: true,
}));

/** A reader that names a binary, or null for the two this process handles. */
export function converterFor(reader: Reader): Converter | null {
  return CONVERTERS.find((c) => c.command === reader) ?? null;
}

/** The reason line for a source whose converter is missing, or null when it is installed. */
export function missingConverter(reader: Reader, pathValue: string): string | null {
  const converter = converterFor(reader);
  if (converter === null || onPath(converter.command, { PATH: pathValue })) {
    return null;
  }
  return `${converter.command} is not on PATH; install ${converter.install}`;
}
