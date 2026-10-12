// Scanning: the generated skill judged by the rules a skill has to meet before anyone
// loads it.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { PLACEHOLDER } from "./generate.ts";

/** A skill body is loaded whole, every time the skill triggers. */
export const MAX_SKILL_BYTES = 12 * 1024;

export interface Finding {
  /** relative to the scanned directory */
  readonly path: string;
  readonly problem: string;
}

function* markdownFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* markdownFiles(path);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield path;
    }
  }
}

/** "p. 42", "pp. 3-5", "page 118": where the source said it, which means nothing in a skill the
 * reader never holds the book beside. */
const PAGE_REFERENCE = /\bpp?\.\s*\d|\bpages?\s+\d/i;

/** "chapter 3", "see the next chapter": where the book said it again, a pointer to nothing. */
const CHAPTER_REFERENCE =
  /\bchapters?\s+(\d+|[ivxl]+\b|one|two|three|four|five|six|seven|eight|nine|ten)\b|\b(this|next|previous|preceding|following|earlier|later)\s+chapter\b/i;

const FRONTMATTER = /^---\n([\s\S]*?)\n---/;
const LINK = /\]\(([^)\s]+)\)/g;

function frontmatterField(body: string, field: string): string {
  const block = FRONTMATTER.exec(body)?.[1] ?? "";
  for (const line of block.split("\n")) {
    const separator = line.indexOf(":");
    if (separator !== -1 && line.slice(0, separator).trim() === field) {
      return line
        .slice(separator + 1)
        .trim()
        .replace(/^"(.*)"$/, "$1");
    }
  }
  return "";
}

function definitionFindings(dir: string, body: string): Finding[] {
  const findings: Finding[] = [];
  if (FRONTMATTER.exec(body) === null) {
    findings.push({ path: "SKILL.md", problem: "no YAML frontmatter" });
    return findings;
  }
  const name = frontmatterField(body, "name");
  if (name.length === 0) {
    findings.push({ path: "SKILL.md", problem: "frontmatter has no name" });
  } else if (name !== basename(dir)) {
    findings.push({
      path: "SKILL.md",
      problem: `frontmatter name ${name} is not the directory name ${basename(dir)}`,
    });
  }
  if (frontmatterField(body, "description").length === 0) {
    findings.push({ path: "SKILL.md", problem: "frontmatter has no description" });
  }
  return findings;
}

function linkFindings(dir: string, file: string, body: string): Finding[] {
  const findings: Finding[] = [];
  for (const match of body.matchAll(LINK)) {
    const target = match[1] ?? "";
    if (target.startsWith("#") || /^[a-z]+:/i.test(target)) {
      continue;
    }
    if (!existsSync(resolve(dirname(file), target))) {
      findings.push({ path: relative(dir, file), problem: `link target ${target} is not there` });
    }
  }
  return findings;
}

/** Every rule the generated skill has to meet. An empty list is the only
 * result that means done. */
export function scanSkill(dir: string): readonly Finding[] {
  if (!(existsSync(dir) && statSync(dir).isDirectory())) {
    return [{ path: ".", problem: `${dir} is not a directory` }];
  }
  const definition = join(dir, "SKILL.md");
  if (!existsSync(definition)) {
    return [{ path: "SKILL.md", problem: "the skill has no definition" }];
  }
  const body = readFileSync(definition, "utf8");
  const findings: Finding[] = definitionFindings(dir, body);
  const bytes = statSync(definition).size;
  if (bytes > MAX_SKILL_BYTES) {
    findings.push({
      path: "SKILL.md",
      problem: `${(bytes / 1024).toFixed(1)} KB over the ${MAX_SKILL_BYTES / 1024} KB cap`,
    });
  }
  for (const file of markdownFiles(dir)) {
    const text = readFileSync(file, "utf8");
    if (text.includes(PLACEHOLDER)) {
      findings.push({ path: relative(dir, file), problem: "still holds a draft placeholder" });
    }
    if (PAGE_REFERENCE.test(text)) {
      findings.push({
        path: relative(dir, file),
        problem: "holds a page reference; state the rule, not where the book said it",
      });
    }
    if (CHAPTER_REFERENCE.test(text)) {
      findings.push({
        path: relative(dir, file),
        problem: "refers to a chapter of the source; state the rule, not where the book said it",
      });
    }
    findings.push(...linkFindings(dir, file, text));
  }
  return findings;
}
