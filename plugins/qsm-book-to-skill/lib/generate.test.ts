import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  type AssembleResult,
  assembleSkill,
  draftSkill,
  PLACEHOLDER,
  skillContents,
} from "./generate.ts";
import { scanSkill } from "./scan.ts";
import { analyzeText } from "./structure.ts";

const sandboxes: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "qsm-book-to-skill-generate-"));
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

const FIXTURE = [
  "# Deep Modules",
  "A module is deep when its interface is small and its behaviour is large.",
  "",
  "# Shallow Modules",
  "A shallow module costs more to call than it saves.",
].join("\n");

/** Replaces every placeholder line, the way the agent does between the two
 * stages, so assembly is exercised on filled drafts. */
function fillDrafts(dir: string): void {
  for (const file of readdirSync(join(dir, "chapters"))) {
    const path = join(dir, "chapters", file);
    writeFileSync(path, readFileSync(path, "utf8").replaceAll(PLACEHOLDER, "written"));
  }
}

describe("draftSkill", () => {
  test("writes a source file and a summary scaffold per chapter", () => {
    const dir = sandbox();
    const result = draftSkill(FIXTURE, analyzeText(FIXTURE), dir);
    expect(result.chapters.map((c) => c.summary)).toEqual([
      "chapters/01-deep-modules.md",
      "chapters/02-shallow-modules.md",
    ]);
    expect(readFileSync(join(dir, result.chapters[0]?.source ?? ""), "utf8")).toContain(
      "interface is small",
    );
    expect(readFileSync(join(dir, result.chapters[0]?.summary ?? ""), "utf8")).toContain(
      "## Frameworks",
    );
  });

  test("every drafted file carries the placeholder that keeps it unfinished", () => {
    const dir = sandbox();
    const result = draftSkill(FIXTURE, analyzeText(FIXTURE), dir);
    for (const file of result.chapters.map((c) => c.summary)) {
      expect(readFileSync(join(dir, file), "utf8")).toContain(PLACEHOLDER);
    }
  });

  test("a draft holds chapters and nothing else to fill", () => {
    const dir = sandbox();
    draftSkill(FIXTURE, analyzeText(FIXTURE), dir);
    expect(readdirSync(dir)).toEqual(["chapters"]);
  });

  test("a chapter with an unusable title still gets a file", () => {
    const dir = sandbox();
    const text = ["# ???", "one", "# !!!", "two"].join("\n");
    const result = draftSkill(text, analyzeText(text), dir);
    expect(result.chapters.map((c) => c.summary)).toEqual([
      "chapters/01-chapter.md",
      "chapters/02-chapter.md",
    ]);
  });
});

/** Draft the fixture, fill every placeholder the way the agent does, then
 * assemble. The three stages always run together here, because assembly has
 * nothing to work from until the first two have. */
function assembled(): AssembleResult {
  const draftDir = sandbox();
  const outRoot = sandbox();
  draftSkill(FIXTURE, analyzeText(FIXTURE), draftDir);
  fillDrafts(draftDir);
  return assembleSkill({
    draftDir,
    outRoot,
    slug: "deep-modules",
    description: "Use when judging whether a module earns its interface.",
  });
}

describe("assembleSkill", () => {
  test("builds one document and no per-chapter files", () => {
    const result = assembled();
    expect(basename(result.dir)).toBe("deep-modules");
    expect(readdirSync(result.dir)).toEqual(["SKILL.md"]);
    expect(result.sections).toEqual(["Deep Modules", "Shallow Modules"]);
  });

  test("the document carries the frontmatter and every chapter's summary, one level down", () => {
    const body = readFileSync(assembled().skillFile, "utf8");
    expect(body.startsWith("---\nname: deep-modules\n")).toBe(true);
    expect(body).toContain("\n## Deep Modules\n");
    expect(body).toContain("\n### Frameworks\n");
    expect(body).toContain("\n## Shallow Modules\n");
  });

  test("the chapters' own text stays behind in the draft", () => {
    expect(readFileSync(assembled().skillFile, "utf8")).not.toContain("interface is small");
  });

  test("a filled draft assembles into a skill that passes its own scan", () => {
    expect(scanSkill(assembled().dir)).toEqual([]);
  });

  test("what the assembled skill holds is read back from the directory", () => {
    expect(skillContents(assembled().dir).bytes).toBeGreaterThan(0);
  });
});
