import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ExtractDeps, extractSources, htmlToText, type RunResult } from "./extract.ts";
import { type Source, scanInputs } from "./sources.ts";

const sandboxes: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "qsm-book-to-skill-extract-"));
  sandboxes.push(dir);
  return dir;
}

/** A PATH holding fake converters, so extraction can be driven without any
 * of the real binaries being installed. */
function fakePath(commands: readonly string[]): string {
  const dir = sandbox();
  for (const command of commands) {
    const path = join(dir, command);
    writeFileSync(path, "#!/bin/sh\nexit 0\n");
    chmodSync(path, 0o755);
  }
  return dir;
}

function deps(overrides: Partial<ExtractDeps> = {}): ExtractDeps {
  const base: ExtractDeps = {
    run: (): RunResult => ({ status: 0, stdout: "", stderr: "" }),
    readFile: (path: string) => `contents of ${path}`,
    pathValue: "",
  };
  return { ...base, ...overrides };
}

function sourcesIn(dir: string): readonly Source[] {
  return scanInputs([dir]).sources;
}

afterEach(() => {
  while (sandboxes.length > 0) {
    const dir = sandboxes.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("htmlToText", () => {
  test("drops tags, script bodies and entities", () => {
    const html = "<html><style>p{}</style><body><p>One &amp; two</p><script>x()</script></body>";
    expect(htmlToText(html)).toBe("One & two");
  });
});

describe("extractSources", () => {
  test("a text source becomes consolidated text with its own metadata", () => {
    const dir = sandbox();
    writeFileSync(join(dir, "book.md"), "# One\nalpha beta\n# Two\ngamma");
    const result = extractSources(sourcesIn(dir), deps({ readFile: () => "# One\nalpha beta" }));
    expect(result.failed).toEqual([]);
    expect(result.text).toContain("source: book.md");
    expect(result.text).toContain("alpha beta");
    expect(result.sources[0]?.words).toBe(4);
    expect(result.sources[0]?.pages).toBeNull();
    expect(result.sources[0]?.tokens).toBeGreaterThan(0);
  });

  test("a PDF reports pages from the converter's page breaks", () => {
    const dir = sandbox();
    writeFileSync(join(dir, "book.pdf"), "binary");
    const result = extractSources(
      sourcesIn(dir),
      deps({
        pathValue: fakePath(["pdftotext"]),
        run: () => ({ status: 0, stdout: "page one\fpage two\fpage three", stderr: "" }),
      }),
    );
    expect(result.sources[0]?.pages).toBe(3);
  });
});

describe("extractSources when a source fails", () => {
  test("a source whose converter is missing fails naming the converter", () => {
    const dir = sandbox();
    writeFileSync(join(dir, "book.mobi"), "binary");
    const result = extractSources(sourcesIn(dir), deps({ pathValue: fakePath([]) }));
    expect(result.sources).toEqual([]);
    expect(result.failed[0]?.reason).toContain("ebook-convert");
  });

  test("the other sources are unaffected by one that fails", () => {
    const dir = sandbox();
    writeFileSync(join(dir, "good.md"), "alpha");
    writeFileSync(join(dir, "bad.mobi"), "binary");
    const result = extractSources(
      sourcesIn(dir),
      deps({ pathValue: fakePath([]), readFile: () => "alpha" }),
    );
    expect(result.sources).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.text).toContain("alpha");
  });

  test("a converter that exits non-zero reports its own message", () => {
    const dir = sandbox();
    writeFileSync(join(dir, "book.pdf"), "binary");
    const result = extractSources(
      sourcesIn(dir),
      deps({
        pathValue: fakePath(["pdftotext"]),
        run: () => ({ status: 3, stdout: "", stderr: "not a PDF" }),
      }),
    );
    expect(result.failed[0]?.reason).toContain("exited 3");
    expect(result.failed[0]?.reason).toContain("not a PDF");
  });

  test("no source at all leaves empty text and every failure named", () => {
    const dir = sandbox();
    writeFileSync(join(dir, "a.mobi"), "x");
    writeFileSync(join(dir, "b.mobi"), "y");
    const result = extractSources(sourcesIn(dir), deps({ pathValue: fakePath([]) }));
    expect(result.text).toBe("");
    expect(result.failed.map((f) => f.path.endsWith(".mobi"))).toEqual([true, true]);
  });
});
