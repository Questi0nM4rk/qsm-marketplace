import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLACEHOLDER } from "./generate.ts";
import { MAX_SKILL_BYTES, scanSkill } from "./scan.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

const frontmatter = (name: string) => `---\nname: ${name}\ndescription: "x"\n---\n\n`;

/** A minimal assembled skill, valid unless a test breaks one thing in it. */
function skillDir(slug: string, definition?: string): string {
  const root = sandboxDir("qsm-book-to-skill-scan-");
  const dir = join(root, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    definition ?? `${frontmatter(slug)}# ${slug}\n\n## One\n\nwritten\n`,
  );
  return dir;
}

describe("scanSkill", () => {
  test("a complete skill has no finding", () => {
    expect(scanSkill(skillDir("one-book"))).toEqual([]);
  });

  test("a missing definition is the only finding worth reporting", () => {
    const dir = skillDir("one-book");
    rmSync(join(dir, "SKILL.md"));
    expect(scanSkill(dir)).toEqual([{ path: "SKILL.md", problem: "the skill has no definition" }]);
  });

  test("frontmatter is required and its name has to be the directory", () => {
    const dir = skillDir("one-book", "# no frontmatter\n\nwritten\n");
    expect(scanSkill(dir)[0]?.problem).toBe("no YAML frontmatter");
    const renamed = skillDir("one-book", `${frontmatter("other")}written\n`);
    expect(scanSkill(renamed)[0]?.problem).toContain("is not the directory name");
  });

  test("an empty description is a finding", () => {
    const dir = skillDir("one-book", '---\nname: one-book\ndescription: ""\n---\n\n# one-book\n');
    expect(scanSkill(dir).some((f) => f.problem === "frontmatter has no description")).toBe(true);
  });

  test("a draft placeholder left anywhere stops the run", () => {
    const dir = skillDir("one-book", `${frontmatter("one-book")}${PLACEHOLDER}: frameworks\n`);
    expect(scanSkill(dir).some((f) => f.problem === "still holds a draft placeholder")).toBe(true);
  });
});

describe("scanSkill and the source's page numbers", () => {
  test.each(["(p. 42)", "pp. 3-5", "see page 118", "on pages 12 to 14", "[p.7]"])(
    "a page reference %s is a finding",
    (reference) => {
      const dir = skillDir("one-book", `${frontmatter("one-book")}Use the rule ${reference}.\n`);
      expect(scanSkill(dir).some((f) => f.problem.includes("page reference"))).toBe(true);
    },
  );

  test("prose that only mentions pages is not a finding", () => {
    const dir = skillDir(
      "one-book",
      `${frontmatter("one-book")}Keep the home page small; a wiki page is not a rule. Step 3 comes first. Version 2.\n`,
    );
    expect(scanSkill(dir)).toEqual([]);
  });
});

describe("scanSkill and the source's chapters", () => {
  test.each([
    "see chapter 3",
    "as Chapter IV says",
    "in chapter two",
    "the next chapter",
    "this chapter",
  ])("a chapter reference %s is a finding", (reference) => {
    const dir = skillDir("one-book", `${frontmatter("one-book")}Use the rule, ${reference}.\n`);
    expect(scanSkill(dir).some((f) => f.problem.includes("chapter of the source"))).toBe(true);
  });
});

describe("scanSkill over the skill's files", () => {
  test("a link to a file that is not there is a finding", () => {
    const dir = skillDir("one-book", `${frontmatter("one-book")}- [Two](02-two.md)\n`);
    expect(scanSkill(dir).some((f) => f.problem.includes("02-two.md"))).toBe(true);
  });

  test("an external link is not checked against the filesystem", () => {
    const dir = skillDir(
      "one-book",
      `${frontmatter("one-book")}[up](https://example.invalid) [top](#one)\n`,
    );
    expect(scanSkill(dir)).toEqual([]);
  });

  test("a definition over the cap is a finding", () => {
    const body = `${frontmatter("one-book")}${"word ".repeat(MAX_SKILL_BYTES)}`;
    expect(scanSkill(skillDir("one-book", body)).some((f) => f.problem.includes("cap"))).toBe(true);
  });

  test("a directory that is not there is reported, not thrown", () => {
    expect(scanSkill(join(sandboxDir("qsm-book-to-skill-scan-"), "absent")).length).toBe(1);
  });
});
