import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkNote, parseFrontmatter, validateFile } from "./note.ts";

// Every sandbox this file makes is removed after the test that made it,
// passing or failing: a `finally` inside one test would leave the rest.
const sandboxes: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "qsm-knowledge-"));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  while (sandboxes.length > 0) {
    const dir = sandboxes.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

const GOOD = `---
title: Strangler fig
created: 2026-01-08
type: concept
tags: [migration, architecture]
---

# Strangler fig

The old system keeps serving until the new one takes each route.
See [[branch-by-abstraction]].
`;

describe("parseFrontmatter", () => {
  test("reads a scalar, a quoted scalar, and a list", () => {
    const fields = parseFrontmatter('---\ntitle: "A note"\ntype: til\ntags: [one, two]\n---\nbody');
    expect(fields).not.toBeNull();
    expect(fields?.title).toBe("A note");
    expect(fields?.type).toBe("til");
    expect(fields?.tags).toEqual(["one", "two"]);
  });

  test("reads a block sequence, the form an editor writes", () => {
    const fields = parseFrontmatter(
      "---\ntitle: A note\ntags:\n  - one\n  - two\ntype: til\n---\nbody",
    );
    expect(fields?.tags).toEqual(["one", "two"]);
    // The key after the sequence still reads as its own scalar: the
    // sequence ends at the next unindented line.
    expect(fields?.type).toBe("til");
  });

  test("a file that does not open with a block has none", () => {
    expect(parseFrontmatter("# Just a heading\n")).toBeNull();
  });
});

describe("checkNote", () => {
  test("a well formed note has no errors and no warnings", () => {
    expect(checkNote(GOOD)).toEqual({ errors: [], warnings: [] });
  });

  test("no frontmatter is one error, not a cascade of missing fields", () => {
    const check = checkNote("# Heading\n\n[[link]]\n");
    expect(check.errors).toHaveLength(1);
    expect(check.errors[0]).toContain("no YAML frontmatter");
  });

  // Spec scenario: A required field is missing or malformed.
  test("lists every problem: missing field, unknown type, bad date, bad tags", () => {
    const check = checkNote(`---
created: 08-01-2026
type: journal
tags: [Migration, two words]
---

body with [[a link]]
`);
    expect(check.errors).toEqual([
      "missing required frontmatter field: title",
      'unknown type "journal": one of til, concept, project, debug, research-summary, index',
      'created must be YYYY-MM-DD, got "08-01-2026"',
      'tag "Migration" must be lowercase',
      'tag "two words" must be hyphenated, not spaced',
    ]);
  });

  test("a note with block sequence tags is well formed", () => {
    const check = checkNote(`---
title: Strangler fig
created: 2026-01-08
type: concept
tags:
  - migration
  - architecture
---

Body with [[branch-by-abstraction]].
`);
    expect(check).toEqual({ errors: [], warnings: [] });
  });

  test("an empty tag list is one error, not two", () => {
    const check = checkNote("---\ntitle: T\ncreated: 2026-01-08\ntype: til\ntags: []\n---\n[[x]]");
    expect(check.errors).toEqual(["missing required frontmatter field: tags"]);
  });

  test("a tags key with nothing under it is the same one error", () => {
    const check = checkNote("---\ntitle: T\ncreated: 2026-01-08\ntype: til\ntags:\n---\n[[x]]");
    expect(check.errors).toEqual(["missing required frontmatter field: tags"]);
  });

  // Spec scenario: No wikilink in the body.
  test("a body without a wikilink warns and does not error", () => {
    const check = checkNote(GOOD.replace("See [[branch-by-abstraction]].", "Nothing links out."));
    expect(check.errors).toEqual([]);
    expect(check.warnings).toHaveLength(1);
    expect(check.warnings[0]).toContain("[[wikilink]]");
  });
});

describe("validateFile", () => {
  test("a good note on disk reports ok", () => {
    const path = join(sandbox(), "note.md");
    writeFileSync(path, GOOD);
    const report = validateFile(path);
    expect(report.ok).toBe(true);
    expect(report.file).toBe(path);
    expect(report.errors).toEqual([]);
  });

  test("a note with a problem reports not ok", () => {
    const path = join(sandbox(), "note.md");
    writeFileSync(path, GOOD.replace("type: concept", "type: journal"));
    expect(validateFile(path).ok).toBe(false);
  });

  test("a path that is not there is an error, not a throw", () => {
    const path = join(sandbox(), "absent.md");
    const report = validateFile(path);
    expect(report.ok).toBe(false);
    expect(report.errors[0]).toBe(`no file at ${path}`);
  });

  test("a directory is an error, not a throw", () => {
    const dir = sandbox();
    const report = validateFile(dir);
    expect(report.ok).toBe(false);
    expect(report.errors).toEqual([`not a file: ${dir}`]);
  });
});
