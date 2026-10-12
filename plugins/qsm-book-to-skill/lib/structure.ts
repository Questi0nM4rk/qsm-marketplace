// Stage three, analyzing structure: where the chapters are, and how much text each one carries.

/** Words per token for whitespace-delimited scripts. */
const WORDS_PER_TOKEN = 0.75;
/** CJK scripts carry little whitespace, so words under-count them by orders
 * of magnitude. Their codepoints are counted against this ratio instead. */
const CJK_CHARS_PER_TOKEN = 1.5;

const CJK = /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/gu;

export function countWords(text: string): number {
  return text.split(/\s+/u).filter((word) => word.length > 0).length;
}

export function estimateTokens(text: string): number {
  const cjkChars = text.match(CJK)?.length ?? 0;
  const latin = cjkChars === 0 ? text : text.replace(CJK, " ");
  return Math.round(countWords(latin) / WORDS_PER_TOKEN + cjkChars / CJK_CHARS_PER_TOKEN);
}

/** How the chapter boundaries were found. `none` means the whole text is
 * one chapter, which is the honest answer for an unstructured source. */
type ChapterMethod = "markdown-heading" | "chapter-line" | "none";

export interface Chapter {
  readonly index: number;
  readonly title: string;
  /** first line of the chapter, counting from 0, heading included */
  readonly startLine: number;
  /** one past the chapter's last line */
  readonly endLine: number;
  readonly words: number;
  readonly tokens: number;
}

export interface Structure {
  readonly method: ChapterMethod;
  readonly words: number;
  readonly tokens: number;
  readonly chapters: readonly Chapter[];
}

const MARKDOWN_HEADING = /^(#{1,3})\s+(\S.*?)\s*$/;
const CHAPTER_LINE = /^\s*(?:chapter|part|section)\s+(?:\d{1,3}|[ivxlcdm]{1,7})\b[\s.:-]*(.*)$/i;

interface Heading {
  readonly line: number;
  readonly title: string;
}

function markdownHeadings(lines: readonly string[]): Heading[] {
  const headings: Heading[] = [];
  for (const [line, text] of lines.entries()) {
    const match = MARKDOWN_HEADING.exec(text);
    if (match?.[2] !== undefined) {
      headings.push({ line, title: match[2] });
    }
  }
  return headings;
}

function chapterLines(lines: readonly string[]): Heading[] {
  const headings: Heading[] = [];
  for (const [line, text] of lines.entries()) {
    const match = CHAPTER_LINE.exec(text);
    if (match !== null) {
      headings.push({ line, title: text.trim() });
    }
  }
  return headings;
}

/** Two headings is the floor. One is a title page, and calling a title page
 * a chapter boundary would split every book into a preface and the rest. */
const MINIMUM_HEADINGS = 2;

function chooseHeadings(lines: readonly string[]): { method: ChapterMethod; found: Heading[] } {
  const markdown = markdownHeadings(lines);
  if (markdown.length >= MINIMUM_HEADINGS) {
    return { method: "markdown-heading", found: markdown };
  }
  const chapters = chapterLines(lines);
  if (chapters.length >= MINIMUM_HEADINGS) {
    return { method: "chapter-line", found: chapters };
  }
  return { method: "none", found: [] };
}

function toChapter(
  heading: Heading,
  index: number,
  endLine: number,
  lines: readonly string[],
): Chapter {
  const body = lines.slice(heading.line, endLine).join("\n");
  return {
    index,
    title: heading.title,
    startLine: heading.line,
    endLine,
    words: countWords(body),
    tokens: estimateTokens(body),
  };
}

/** Splits the text at its headings. */
export function analyzeText(text: string): Structure {
  const lines = text.split("\n");
  const { method, found } = chooseHeadings(lines);
  const whole: Structure = {
    method,
    words: countWords(text),
    tokens: estimateTokens(text),
    chapters: [],
  };
  if (found.length === 0) {
    return {
      ...whole,
      chapters: [toChapter({ line: 0, title: "the whole text" }, 1, lines.length, lines)],
    };
  }
  const starts = found.map((heading, position) =>
    position === 0 ? { ...heading, line: 0 } : heading,
  );
  const chapters = starts.map((heading, position) =>
    toChapter(heading, position + 1, starts[position + 1]?.line ?? lines.length, lines),
  );
  return { ...whole, chapters };
}

/** The chapter's own text, for the stage that writes it to a file. */
export function chapterText(text: string, chapter: Chapter): string {
  return text.split("\n").slice(chapter.startLine, chapter.endLine).join("\n");
}
