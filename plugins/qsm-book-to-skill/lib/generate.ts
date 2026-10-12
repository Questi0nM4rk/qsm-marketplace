// Drafting, then assembling.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { slugify } from "./naming.ts";
import { type Chapter, chapterText, type Structure } from "./structure.ts";

/** Left in every drafted file. Scanning refuses a skill that still holds
 * one, which is what keeps an unfinished draft from being called done. */
export const PLACEHOLDER = "TODO(book-to-skill)";

const SUMMARY_SECTIONS: readonly string[] = [
  "Frameworks",
  "Principles",
  "Techniques",
  "Anti-patterns",
];

interface DraftedChapter {
  readonly index: number;
  readonly title: string;
  /** file the summary is written into, relative to the draft directory */
  readonly summary: string;
  /** file holding the chapter's own text, relative to the draft directory */
  readonly source: string;
  readonly tokens: number;
}

export interface DraftResult {
  readonly dir: string;
  readonly chapters: readonly DraftedChapter[];
}

const CHAPTERS_DIR = "chapters";

function chapterSlug(chapter: Chapter): string {
  const slug = slugify(chapter.title).slice(0, 48);
  return slug.length === 0 ? "chapter" : slug;
}

/** Everything in a summary lands in the one skill document, so the scaffold holds only what the
 * skill should keep: a title and the sections to fill or delete. */
function summaryScaffold(chapter: Chapter): string {
  const sections = SUMMARY_SECTIONS.map(
    (heading) => `## ${heading}\n\n${PLACEHOLDER}: ${heading.toLowerCase()} the source names.\n`,
  );
  return [`# ${chapter.title}`, "", ...sections].join("\n");
}

/** Writes the draft directory. */
export function draftSkill(text: string, structure: Structure, dir: string): DraftResult {
  mkdirSync(join(dir, CHAPTERS_DIR), { recursive: true });
  const chapters = structure.chapters.map((chapter) => {
    const stem = `${String(chapter.index).padStart(2, "0")}-${chapterSlug(chapter)}`;
    const source = `${CHAPTERS_DIR}/${stem}.source.md`;
    const summary = `${CHAPTERS_DIR}/${stem}.md`;
    writeFileSync(join(dir, source), `${chapterText(text, chapter).trim()}\n`);
    writeFileSync(join(dir, summary), summaryScaffold(chapter));
    return { index: chapter.index, title: chapter.title, summary, source, tokens: chapter.tokens };
  });
  return { dir, chapters };
}

export interface AssembleOptions {
  readonly draftDir: string;
  readonly outRoot: string;
  readonly slug: string;
  readonly description: string;
}

export interface AssembleResult {
  readonly dir: string;
  readonly skillFile: string;
  /** the titles of the summaries merged into the document, in order */
  readonly sections: readonly string[];
}

function firstHeading(text: string, fallback: string): string {
  for (const line of text.split("\n")) {
    const heading = /^#\s+(\S.*?)\s*$/.exec(line);
    if (heading?.[1] !== undefined) {
      return heading[1];
    }
  }
  return fallback;
}

/** The summaries, in file order; the `.source.md` files stay behind in the
 * draft directory, because a skill that ships the whole book is the book. */
function summaryFiles(draftDir: string): string[] {
  const dir = join(draftDir, CHAPTERS_DIR);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md") && !file.endsWith(".source.md"))
    .sort((a, b) => a.localeCompare(b));
}

/** One level down, so a chapter's title becomes a section of the skill and its sections the
 * subsections, under the skill's own title. */
function demoted(body: string): string {
  return body
    .split("\n")
    .map((line) => (/^#{1,5}\s/.test(line) ? `#${line}` : line))
    .join("\n")
    .trim();
}

function skillBody(options: AssembleOptions, merged: readonly string[]): string {
  return `${[
    "---",
    `name: ${options.slug}`,
    `description: "${options.description}"`,
    "---",
    "",
    `# ${options.slug}`,
    "",
    options.description,
    "",
    ...merged.flatMap((section) => [section, ""]),
  ]
    .join("\n")
    .trimEnd()}\n`;
}

export interface SkillContents {
  readonly bytes: number;
}

/**
 * What an assembled skill holds, read back from the directory rather than from the assembly that
 * wrote it, so a hand-edited skill reports what it actually is.
 */
export function skillContents(dir: string): SkillContents {
  const definition = join(dir, "SKILL.md");
  return { bytes: existsSync(definition) ? readFileSync(definition, "utf8").length : 0 };
}

/** Merges the filled drafts into one `<outRoot>/<slug>/SKILL.md`. Nothing here judges the
 * content; scanning does. */
export function assembleSkill(options: AssembleOptions): AssembleResult {
  const dir = join(options.outRoot, options.slug);
  mkdirSync(dir, { recursive: true });
  const merged: string[] = [];
  const sections: string[] = [];
  for (const file of summaryFiles(options.draftDir)) {
    const body = readFileSync(join(options.draftDir, CHAPTERS_DIR, file), "utf8");
    sections.push(firstHeading(body, basename(file, ".md")));
    merged.push(demoted(body));
  }
  const skillFile = join(dir, "SKILL.md");
  writeFileSync(skillFile, skillBody(options, merged));
  return { dir, skillFile, sections };
}
