import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { READER_BY_EXTENSION, scanInputs } from "./sources.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

describe("scanInputs", () => {
  test("a named file with a supported extension carries its reader and size", () => {
    const dir = sandboxDir("qsm-book-to-skill-sources-");
    writeFileSync(join(dir, "book.md"), "hello");
    const scan = scanInputs([join(dir, "book.md")]);
    expect(scan.rejected).toEqual([]);
    expect(scan.sources).toHaveLength(1);
    expect(scan.sources[0]?.reader).toBe("text");
    expect(scan.sources[0]?.extension).toBe(".md");
    expect(scan.sources[0]?.bytes).toBe(5);
  });

  test("a named file this converter cannot read is rejected with the reason", () => {
    const dir = sandboxDir("qsm-book-to-skill-sources-");
    writeFileSync(join(dir, "cover.png"), "x");
    const scan = scanInputs([join(dir, "cover.png")]);
    expect(scan.sources).toEqual([]);
    expect(scan.rejected[0]?.reason).toContain(".png");
  });

  test("a path that is not there is rejected rather than ignored", () => {
    const scan = scanInputs([join(sandboxDir("qsm-book-to-skill-sources-"), "missing.pdf")]);
    expect(scan.sources).toEqual([]);
    expect(scan.rejected[0]?.reason).toBe("does not exist");
  });

  test("a directory contributes only the files this converter reads", () => {
    const dir = sandboxDir("qsm-book-to-skill-sources-");
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "one.epub"), "a");
    writeFileSync(join(dir, "nested", "two.pdf"), "b");
    writeFileSync(join(dir, "cover.png"), "c");
    const scan = scanInputs([dir]);
    expect(scan.sources.map((s) => s.reader).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "pandoc",
      "pdftotext",
    ]);
    expect(scan.rejected).toEqual([]);
  });
});

describe("scanInputs over several inputs", () => {
  test("the same file named twice is one source", () => {
    const dir = sandboxDir("qsm-book-to-skill-sources-");
    writeFileSync(join(dir, "book.md"), "hello");
    const scan = scanInputs([join(dir, "book.md"), dir]);
    expect(scan.sources).toHaveLength(1);
  });

  test("a quoted glob expands relative to the working directory", () => {
    const dir = sandboxDir("qsm-book-to-skill-sources-");
    mkdirSync(join(dir, "chapters"));
    writeFileSync(join(dir, "chapters", "one.md"), "a");
    writeFileSync(join(dir, "chapters", "two.md"), "b");
    writeFileSync(join(dir, "chapters", "notes.png"), "c");
    const scan = scanInputs(["chapters/*.md"], dir);
    expect(scan.sources.map((s) => s.path.endsWith(".md"))).toEqual([true, true]);
  });

  test("a glob that matches nothing is reported, not silently empty", () => {
    const scan = scanInputs(["*.epub"], sandboxDir("qsm-book-to-skill-sources-"));
    expect(scan.rejected[0]?.reason).toBe("matched no file");
  });

  test("every supported extension maps to exactly one reader", () => {
    expect(READER_BY_EXTENSION.get(".pdf")).toBe("pdftotext");
    expect(READER_BY_EXTENSION.get(".mobi")).toBe("ebook-convert");
    expect(READER_BY_EXTENSION.get(".htm")).toBe("html");
  });
});
