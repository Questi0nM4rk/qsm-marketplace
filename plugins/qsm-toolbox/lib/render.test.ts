import { expect, describe as group, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QSM_BINS, TOOLS } from "./catalog.ts";
import { blurbWords, caveatTable, describe, MAX_BLURB_WORDS } from "./render.ts";

const SKILL = resolve(import.meta.dir, "../skills/toolbox/SKILL.md");
const text = readFileSync(SKILL, "utf8");

function frontmatterDescription(): string {
  const end = text.indexOf("\n---", 4);
  const line = text
    .slice(4, end)
    .split("\n")
    .find((candidate) => candidate.startsWith("description:"));
  return (line ?? "")
    .slice("description:".length)
    .trim()
    .replace(/^"(.*)"$/, "$1");
}

/** The body is everything after the frontmatter: what the spec caps at 8 KB. */
function body(): string {
  return text.slice(text.indexOf("\n---", 4) + "\n---\n".length);
}

const BODY_CAP_BYTES = 8 * 1024;

group("the index is always in context", () => {
  test("A fresh session", () => {
    expect(frontmatterDescription()).toBe(describe());
    for (const entry of [...TOOLS, ...QSM_BINS]) {
      expect(describe()).toContain(`${entry.bin} (${entry.blurb})`);
    }
    expect(TOOLS.length + QSM_BINS.length).toBe(33);
  });

  test("An entry over the word cap", () => {
    for (const entry of [...TOOLS, ...QSM_BINS]) {
      expect(blurbWords(entry.blurb)).toBeLessThanOrEqual(MAX_BLURB_WORDS);
    }
    expect(blurbWords("one two three four five")).toBeGreaterThan(MAX_BLURB_WORDS);
  });
});

group("the body is one caveat per tool", () => {
  test("A tool with a caveat", () => {
    const ast = TOOLS.find((tool) => tool.bin === "ast-grep");
    expect(caveatTable()).toContain(`| \`ast-grep\` | ${ast?.caveat} |`);
  });

  test("A tool with nothing to add has no row", () => {
    expect(caveatTable()).not.toContain("`mlr`");
    expect(caveatTable()).not.toContain("go install");
  });

  test("the skill body carries every caveat verbatim, and no qsm table", () => {
    expect(text).toContain(caveatTable());
    for (const tool of TOOLS.filter((candidate) => candidate.caveat !== null)) {
      expect(text).toContain(tool.caveat ?? "");
    }
    expect(text).not.toContain("USAGE.md");
  });

  test("the body stays under 8 KB", () => {
    expect(Buffer.byteLength(body(), "utf8")).toBeLessThan(BODY_CAP_BYTES);
  });
});
