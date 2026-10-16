// The one binary through its real surface: argv, stdout, stderr, exit.

import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { envelopeOf, isolatedEnv, runBin } from "../../../lib/fixtures/cli.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { isRecord } from "../../../lib/outcome.ts";

const CLI = resolve(import.meta.dir, "cli.ts");

function sandboxFile(name: string, content: string): string {
  const dir = sandboxDir("qsm-usage-test-");
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

function run(script: string, args: string[], env: Record<string, string> = {}) {
  return runBin(script, args, { env: isolatedEnv(sandboxDir("qsm-usage-home-"), env) });
}

/** The `data` of a `--json` run, which every verb here prints as an object. */
function dataOf(stdout: string): Record<string, unknown> {
  const { data } = envelopeOf(stdout);
  if (!isRecord(data)) {
    throw new TypeError(`envelope data is not an object: ${stdout}`);
  }
  return data;
}

describe("qsm-usage toon", () => {
  test("toon --help lists the group's verbs", () => {
    const result = run(CLI, ["toon", "--help"]);
    expect(result.exit).toBe(0);
    expect(result.stdout).toContain("usage: qsm-usage toon <verb>");
    for (const verb of ["encode", "decode", "size", "wrap"]) {
      expect(result.stdout).toContain(`  ${verb}`);
    }
  });

  test("--help lists every verb qsm.json declares", () => {
    const result = run(CLI, ["--help"]);
    expect(result.exit).toBe(0);
    for (const verb of [
      "toon encode",
      "toon decode",
      "toon size",
      "toon wrap",
      "filter",
      "doctor",
      "count",
    ]) {
      expect(result.stdout).toContain(`  ${verb}`);
    }
  });

  test("encode writes TOON to stdout and exits 0", () => {
    const file = sandboxFile("people.json", '[{"id":1,"name":"Alice"}]');
    const result = run(CLI, ["toon", "encode", file]);
    expect(result.exit).toBe(0);
    expect(result.stdout.trim()).toBe("[1]{id,name}:\n  1,Alice");
  });

  test("encode --json is an envelope carrying the toon", () => {
    const file = sandboxFile("people.json", '[{"id":1,"name":"Alice"}]');
    const result = run(CLI, ["toon", "encode", file, "--json"]);
    expect(result.exit).toBe(0);
    expect(envelopeOf(result.stdout)).toMatchObject({ code: "ok", exit: 0 });
    expect(dataOf(result.stdout).toon).toBe("[1]{id,name}:\n  1,Alice");
  });

  test("decode writes unindented JSON to stdout", () => {
    const file = sandboxFile("people.toon", "[1]{id,name}:\n  1,Alice\n");
    const result = run(CLI, ["toon", "decode", file]);
    expect(result.exit).toBe(0);
    expect(result.stdout.trim()).toBe('[{"id":1,"name":"Alice"}]');
  });
});

describe("qsm-usage toon failures", () => {
  test("encode of an unsupported extension fails with no partial output", () => {
    const file = sandboxFile("notes.md", "# Title\n");
    const result = run(CLI, ["toon", "encode", file]);
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("unsupported extension");
  });

  test("a Markdown file with no frontmatter fails", () => {
    const file = sandboxFile("notes.md", "# Title\n");
    const result = run(CLI, ["toon", "encode", file, "--frontmatter"]);
    expect(result.exit).toBe(1);
    expect(result.stderr).toContain("frontmatter");
  });

  test("a table under a heading encodes", () => {
    const file = sandboxFile("doc.md", "## Grid\n\n| a | b |\n| --- | --- |\n| x | y |\n");
    const result = run(CLI, ["toon", "encode", file, "--table", "--section", "grid"]);
    expect(result.exit).toBe(0);
    expect(result.stdout.trim()).toBe("[1]{a,b}:\n  x,y");
  });

  test("--table without --section is usage, exit 2", () => {
    const file = sandboxFile("doc.md", "## Grid\n");
    const result = run(CLI, ["toon", "encode", file, "--table"]);
    expect(result.exit).toBe(2);
    expect(result.stderr).toContain("--section");
  });
});

describe("qsm-usage size, doctor and unknown verbs", () => {
  test("size discloses that its token counts are an estimate", () => {
    const file = sandboxFile("people.json", '[{"id":1,"name":"Alice"}]');
    const result = run(CLI, ["toon", "size", file]);
    expect(result.exit).toBe(0);
    expect(result.stdout).toContain("estimate");
    expect(result.stdout).toContain("ratio:");
  });

  test("doctor reports a binary it cannot reach as missing, exit 4", () => {
    const result = run(CLI, ["doctor", "--json"], {
      QSM_FILTER_BIN: "qsm-no-such-filter-binary",
    });
    expect(result.exit).toBe(4);
    expect(envelopeOf(result.stdout)).toMatchObject({ code: "missing", exit: 4 });
    expect(dataOf(result.stdout).allUsable).toBe(false);
  });

  test("an unknown verb is usage, exit 2", () => {
    expect(run(CLI, ["frobnicate"]).exit).toBe(2);
  });
});

describe("qsm-usage count", () => {
  test("--help lists the count verb", () => {
    const result = run(CLI, ["--help"]);
    expect(result.exit).toBe(0);
    expect(result.stdout).toContain("  count");
  });

  test("counts a file with the offline estimate and exits 0", () => {
    const file = sandboxFile("a.md", "Hello, world!");
    const result = run(CLI, ["count", file]);
    expect(result.exit).toBe(0);
    expect(result.stdout).toContain("a.md");
  });

  test("counts several files and totals them under --json", () => {
    const one = sandboxFile("a.md", "Hello, world!");
    const two = sandboxFile("b.md", "Goodbye, world!");
    const result = run(CLI, ["count", one, two, "--json"]);
    expect(result.exit).toBe(0);
    const envelope = envelopeOf(result.stdout);
    expect(envelope.code).toBe("ok");
    expect(dataOf(result.stdout).files).toHaveLength(2);
    expect(dataOf(result.stdout).total).toBeGreaterThan(0);
  });

  test("Exact mode without the credential", () => {
    const file = sandboxFile("a.md", "Hello, world!");
    const result = run(CLI, ["count", file, "--mode", "exact"]);
    expect(result.exit).toBe(4);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("ANTHROPIC_API_KEY");
  });

  test("A file the caller named that is not there", () => {
    // A path the caller named that is not there is an absent prerequisite by
    // the outcome table's wording, the same code the sibling plugins give it.
    const result = run(CLI, ["count", "/nonexistent/qsm-usage-missing.md", "--json"]);
    expect(result.exit).toBe(4);
    const envelope = envelopeOf(result.stdout);
    expect(envelope.code).toBe("missing");
    expect(envelope.message).toContain("/nonexistent/qsm-usage-missing.md");
  });

  test("no input at all is usage, exit 2", () => {
    expect(run(CLI, ["count"]).exit).toBe(2);
  });

  test("an unknown mode is usage, exit 2", () => {
    const file = sandboxFile("a.md", "x");
    expect(run(CLI, ["count", file, "--mode", "psychic"]).exit).toBe(2);
  });
});
