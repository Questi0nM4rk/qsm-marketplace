// The pipeline's own contract: a stage runs on the stage before it having
// written a file, not on the stage before it running. Each test here starts
// a stage from artifacts it wrote itself, with none of the earlier stages
// ever invoked.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { analyzeText } from "../lib/structure.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

const CLI = resolve(import.meta.dir, "cli.ts");
interface Run {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

function run(args: readonly string[]): Run {
  const done = spawnSync("bun", [CLI, ...args], { encoding: "utf8" });
  return { status: done.status ?? 1, stdout: done.stdout ?? "", stderr: done.stderr ?? "" };
}

/** The one JSON value the shared base prints on stdout under --json. */
const ENVELOPE = z.object({
  code: z.string(),
  exit: z.number(),
  data: z
    .object({
      sources: z.array(z.object({})).optional(),
      chapters: z.array(z.object({})).optional(),
    })
    .nullish(),
});

function envelope(r: Run): z.infer<typeof ENVELOPE> {
  return ENVELOPE.parse(JSON.parse(r.stdout));
}

const FIXTURE = ["# One", "alpha beta", "", "# Two", "gamma delta"].join("\n");

/** A run directory holding only what the analyze stage would have left. */
function afterAnalyze(): string {
  const work = sandboxDir("qsm-book-to-skill-cli-");
  writeFileSync(join(work, "text.md"), FIXTURE);
  writeFileSync(join(work, "structure.json"), JSON.stringify(analyzeText(FIXTURE)));
  return work;
}

/** What the model does between draft and assemble: every scaffold replaced,
 * so nothing a scan refuses is left behind. */
function fillDraft(dir: string): void {
  for (const file of readdirSync(join(dir, "chapters"))) {
    if (file.endsWith(".md") && !file.endsWith(".source.md")) {
      writeFileSync(join(dir, "chapters", file), "# One\n\n## Frameworks\n\nnamed here\n");
    }
  }
}

/** A run directory after the draft stage, ready to be filled and assembled. */
function drafted(): string {
  const work = afterAnalyze();
  run(["draft", "--work", work]);
  return work;
}

/** The assemble call every verdict test makes: a named skill with a trigger description. */
function assembleTwoChapters(work: string, out: string): Run {
  return run([
    "assemble",
    "--work",
    work,
    "--out",
    out,
    "--name",
    "two-chapters",
    "--description",
    "Use when judging chapters.",
  ]);
}

function assembledAndScanned(work: string): { out: string; scanned: Run } {
  const out = sandboxDir("qsm-book-to-skill-cli-");
  assembleTwoChapters(work, out);
  return { out, scanned: run(["scan", "--work", work]) };
}

describe("the call itself", () => {
  test("help lists every verb and exits 0", () => {
    const help = run(["--help"]);
    expect(help.status).toBe(0);
    for (const verb of ["name", "deps", "report"]) {
      expect(help.stdout).not.toContain(`  ${verb}\n`);
    }
    for (const verb of ["validate", "extract", "analyze", "draft", "assemble", "scan"]) {
      expect(help.stdout).toContain(`  ${verb}`);
    }
  });

  test("a word that is not a verb is a broken call, not a failed stage", () => {
    expect(run(["exract"]).status).toBe(2);
  });

  test("a flag nobody declared is a usage error, exit 2", () => {
    const wrong = run(["scan", "--nope"]);
    expect(wrong.status).toBe(2);
    expect(wrong.stderr).toContain("unknown flag --nope");
  });

  test("a stage whose input is not there names the file and reports missing", () => {
    const missing = run(["analyze", "--work", sandboxDir("qsm-book-to-skill-cli-")]);
    expect(missing.status).toBe(4);
    expect(missing.stderr).toContain("text.md");
  });

  test("a usage error under --json is still one envelope", () => {
    const wrong = run(["scan", "--nope", "--json"]);
    expect(wrong.status).toBe(2);
    expect(envelope(wrong)).toMatchObject({ code: "usage", exit: 2 });
  });
});

describe("a stage runs on its own", () => {
  test("draft runs from the analyze stage's files with no earlier stage invoked", () => {
    const work = afterAnalyze();
    const result = run(["draft", "--work", work, "--json"]);
    expect(result.status).toBe(0);
    expect(envelope(result)).toMatchObject({ code: "ok", exit: 0 });
    expect(envelope(result).data?.chapters).toHaveLength(2);
  });

  test("assemble runs from a draft directory and a name passed in", () => {
    const work = drafted();
    const out = sandboxDir("qsm-book-to-skill-cli-");
    const assembled = assembleTwoChapters(work, out);
    expect(assembled.status).toBe(0);
    expect(assembled.stdout).toContain(join(out, "two-chapters"));
  });

  test("assemble without a description is a usage error, because a generic one never triggers", () => {
    const work = drafted();
    const assembled = run([
      "assemble",
      "--work",
      work,
      "--out",
      sandboxDir("qsm-book-to-skill-cli-"),
      "--name",
      "x-book",
    ]);
    expect(assembled.status).toBe(2);
    expect(assembled.stderr).toContain("description");
  });

  test("assemble derives the slug from the text's title when no name is given", () => {
    const work = drafted();
    const out = sandboxDir("qsm-book-to-skill-cli-");
    const assembled = run(["assemble", "--work", work, "--out", out, "--description", "Use when."]);
    expect(assembled.status).toBe(0);
    expect(assembled.stdout).toContain(join(out, "one"));
  });

  test("scan runs on a skill directory it is pointed at", () => {
    const out = sandboxDir("qsm-book-to-skill-cli-");
    const dir = join(out, "hand-made");
    mkdirSync(join(dir, "chapters"), { recursive: true });
    writeFileSync(join(dir, "chapters", "01-one.md"), "# One\n\nwritten\n");
    writeFileSync(join(dir, "SKILL.md"), '---\nname: hand-made\ndescription: "Use when."\n---\n');
    expect(run(["scan", "--skill", dir]).status).toBe(0);
  });
});

describe("a stage that resolves nothing fails", () => {
  test("validate exits 1 on a named file it cannot read, and says why", () => {
    const work = sandboxDir("qsm-book-to-skill-cli-");
    const source = join(sandboxDir("qsm-book-to-skill-cli-"), "notes.bin");
    writeFileSync(source, "not a book");
    const validated = run(["validate", source, "--work", work]);
    expect(validated.status).toBe(1);
    expect(validated.stderr).toContain("unsupported extension .bin");
  });

  test("extract exits 1 when no source extracted, and names each one that failed", () => {
    const work = sandboxDir("qsm-book-to-skill-cli-");
    const gone = join(sandboxDir("qsm-book-to-skill-cli-"), "gone.md");
    writeFileSync(
      join(work, "sources.json"),
      JSON.stringify({
        sources: [{ path: gone, extension: ".md", reader: "text", bytes: 0 }],
        rejected: [],
      }),
    );
    const extracted = run(["extract", "--work", work]);
    expect(extracted.status).toBe(1);
    expect(extracted.stderr).toContain("failed");
    expect(extracted.stderr).toContain("gone.md");
  });
});

describe("scan is the verdict", () => {
  test("an unfilled draft assembles but fails the scan", () => {
    const { scanned } = assembledAndScanned(drafted());
    expect(scanned.status).toBe(1);
    expect(scanned.stderr).toContain("draft placeholder");
  });

  test("a filled draft is clean, with the location and what it holds", () => {
    const work = drafted();
    fillDraft(join(work, "draft"));
    const { out, scanned } = assembledAndScanned(work);
    expect(scanned.status).toBe(0);
    expect(scanned.stdout).toContain(join(out, "two-chapters"));
    expect(scanned.stdout).toContain("bytes: ");
  });
});

describe("a stage that resolves some of its inputs", () => {
  test("a rejected input beside a readable one is partial: exit 0, a warning, the envelope says so", () => {
    const work = sandboxDir("qsm-book-to-skill-cli-");
    const inputs = sandboxDir("qsm-book-to-skill-cli-");
    writeFileSync(join(inputs, "book.md"), "# One\n\nalpha\n");
    writeFileSync(join(inputs, "notes.bin"), "not a book");
    const validated = run([
      "validate",
      join(inputs, "book.md"),
      join(inputs, "notes.bin"),
      "--work",
      work,
    ]);
    expect(validated.status).toBe(0);
    expect(validated.stderr).toContain("warning: partial:");
    expect(validated.stderr).toContain("unsupported extension .bin");
    expect(validated.stdout).toContain("sources: 1");
    const asJson = run([
      "validate",
      join(inputs, "book.md"),
      join(inputs, "notes.bin"),
      "--work",
      sandboxDir("qsm-book-to-skill-cli-"),
      "--json",
    ]);
    expect(asJson.status).toBe(0);
    expect(JSON.parse(asJson.stdout)).toMatchObject({ code: "partial", exit: 0 });
  });

  test("several inputs are read as one repeatable positional", () => {
    const work = sandboxDir("qsm-book-to-skill-cli-");
    const inputs = sandboxDir("qsm-book-to-skill-cli-");
    writeFileSync(join(inputs, "a.md"), "# A\n");
    writeFileSync(join(inputs, "b.md"), "# B\n");
    const validated = run([
      "validate",
      join(inputs, "a.md"),
      join(inputs, "b.md"),
      "--work",
      work,
      "--json",
    ]);
    expect(validated.status).toBe(0);
    expect((envelope(validated).data?.sources ?? []).length).toBe(2);
  });
});

describe("doctor", () => {
  test("doctor with no converter on PATH is ok and warns once per converter", () => {
    const done = spawnSync(process.execPath, [CLI, "doctor", "--json"], {
      encoding: "utf8",
      env: { ...process.env, PATH: sandboxDir("qsm-book-to-skill-cli-") },
    });
    expect(done.status).toBe(0);
    const said = z
      .object({ code: z.string(), warnings: z.array(z.string()) })
      .parse(JSON.parse(done.stdout));
    expect(said.code).toBe("ok");
    expect(said.warnings).toHaveLength(3);
    expect(said.warnings[0]).toContain("pdftotext is not on PATH");
    expect(said.warnings[0]).toContain(".pdf");
  });
});
