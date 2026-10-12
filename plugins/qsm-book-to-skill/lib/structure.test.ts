import { describe, expect, test } from "bun:test";
import {
  analyzeText,
  type Chapter,
  chapterText,
  countWords,
  estimateTokens,
  type Structure,
} from "./structure.ts";

function chapterAt(structure: Structure, index: number): Chapter {
  const chapter = structure.chapters[index];
  if (chapter === undefined) {
    throw new Error(`no chapter at index ${index}`);
  }
  return chapter;
}

describe("counts", () => {
  test("words ignore runs of whitespace", () => {
    expect(countWords("  one   two\nthree \t four ")).toBe(4);
  });

  test("an empty text has no words and no tokens", () => {
    expect(countWords("")).toBe(0);
    expect(estimateTokens("")).toBe(0);
  });

  test("tokens exceed words for latin text", () => {
    const text = "one two three four five six seven eight";
    expect(estimateTokens(text)).toBeGreaterThan(countWords(text));
  });

  test("CJK characters are counted by codepoint, not by word", () => {
    expect(estimateTokens("日本語のテキストです")).toBeGreaterThan(1);
  });
});

describe("analyzeText", () => {
  test("markdown headings become chapters and front matter joins the first", () => {
    const text = ["a preface line", "", "# One", "body", "", "# Two", "more"].join("\n");
    const structure = analyzeText(text);
    expect(structure.method).toBe("markdown-heading");
    expect(structure.chapters.map((c) => c.title)).toEqual(["One", "Two"]);
    expect(structure.chapters[0]?.startLine).toBe(0);
    expect(chapterText(text, chapterAt(structure, 0))).toContain("a preface line");
  });

  test("a plain text book splits on its chapter lines", () => {
    const text = ["Chapter 1: Beginnings", "body", "Chapter 2. Middles", "more"].join("\n");
    const structure = analyzeText(text);
    expect(structure.method).toBe("chapter-line");
    expect(structure.chapters).toHaveLength(2);
    expect(structure.chapters[1]?.title).toBe("Chapter 2. Middles");
  });

  test("roman numerals count as chapter lines", () => {
    const text = ["Chapter I", "body", "Chapter II", "more"].join("\n");
    expect(analyzeText(text).method).toBe("chapter-line");
  });

  test("a single heading is not a boundary", () => {
    const structure = analyzeText(["# Only", "body"].join("\n"));
    expect(structure.method).toBe("none");
    expect(structure.chapters).toHaveLength(1);
  });

  test("an unstructured text is one chapter covering all of it", () => {
    const text = "just some prose with no structure at all";
    const structure = analyzeText(text);
    expect(structure.method).toBe("none");
    expect(structure.chapters[0]?.title).toBe("the whole text");
    expect(chapterText(text, chapterAt(structure, 0))).toBe(text);
  });

  test("chapter counts sum to roughly the whole text", () => {
    const text = ["# One", "alpha beta", "# Two", "gamma delta"].join("\n");
    const structure = analyzeText(text);
    const chapterWords = structure.chapters.reduce((sum, c) => sum + c.words, 0);
    expect(chapterWords).toBe(structure.words);
  });
});
