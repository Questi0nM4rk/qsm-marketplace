import { describe, expect, test } from "bun:test";
import { QsmError } from "../../../lib/qsm-error.ts";
import {
  extractFrontmatter,
  extractTable,
  frontmatterText,
  headings,
  tableText,
} from "./markdown.ts";

const DOC = `---
name: strict
aliases:
  - hard
  - picky
---

# Title

Some prose.

## Matrix

| verb | effect |
| --- | --- |
| encode | to TOON |
| decode | to JSON |

## Empty section

No table here.
`;

describe("frontmatter", () => {
  test("a leading YAML block becomes a value", () => {
    expect(extractFrontmatter(DOC)).toEqual({ name: "strict", aliases: ["hard", "picky"] });
  });

  test("its raw text is available for a size comparison", () => {
    expect(frontmatterText(DOC)).toContain("name: strict");
  });

  test("no leading delimiter is an error", () => {
    expect(() => extractFrontmatter("# Title\n")).toThrow(QsmError);
  });

  test("a malformed block is an error, not an empty result", () => {
    expect(() => extractFrontmatter("---\na: [unclosed\n---\n")).toThrow(QsmError);
  });
});

describe("table under a heading", () => {
  test("rows become objects keyed by the header cells", () => {
    expect(extractTable(DOC, "Matrix")).toEqual([
      { verb: "encode", effect: "to TOON" },
      { verb: "decode", effect: "to JSON" },
    ]);
  });

  test("the heading match ignores case", () => {
    expect(extractTable(DOC, "mAtRiX")).toHaveLength(2);
  });

  test("a heading that is not there lists the ones that are", () => {
    expect(() => extractTable(DOC, "Nope")).toThrow(/Matrix/);
  });

  test("a heading with no table names that section", () => {
    expect(() => extractTable(DOC, "Empty section")).toThrow(/Empty section/);
  });

  test("its raw text is the file's own lines, so a size ratio compares like with like", () => {
    const raw = tableText(DOC, "Matrix");
    expect(raw.split("\n")).toHaveLength(4);
    expect(raw).toContain("| encode | to TOON |");
    expect(raw).not.toContain('{"verb"');
  });

  test("raw text of a heading that is not there is an error", () => {
    expect(() => tableText(DOC, "Nope")).toThrow(QsmError);
  });

  test("headings are listed without their hashes", () => {
    expect(headings(DOC)).toEqual(["Title", "Matrix", "Empty section"]);
  });
});
