// The shapes of the files one stage writes and the next reads, checked where they are read back.

import { z } from "zod";

export const sourcesFile = z.object({
  sources: z.array(
    z.object({
      path: z.string(),
      extension: z.string(),
      reader: z.enum(["text", "html", "pdftotext", "pandoc", "ebook-convert"]),
      bytes: z.number(),
    }),
  ),
});

export const structureFile = z.object({
  method: z.enum(["markdown-heading", "chapter-line", "none"]),
  words: z.number(),
  tokens: z.number(),
  chapters: z.array(
    z.object({
      index: z.number(),
      title: z.string(),
      startLine: z.number(),
      endLine: z.number(),
      words: z.number(),
      tokens: z.number(),
    }),
  ),
});

export const skillFile = z.object({ dir: z.string() });
