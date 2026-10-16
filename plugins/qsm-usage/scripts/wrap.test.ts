// `qsm-usage toon wrap` through the real binary: text on stdin, one envelope
// on stdout, exit 0 whether the TOON form or the original wins.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { isPlainObject } from "../lib/toon-scalar.ts";
import { envelopeOf } from "./envelope.ts";

const CLI = resolve(import.meta.dir, "cli.ts");

interface Wrap {
  use: "toon" | "original";
  format: "json" | "yaml" | "toml" | null;
  originalTokens: number;
  toonTokens: number;
  toon?: string;
  reason: string;
}

function isWrap(value: unknown): value is Wrap {
  return (
    isPlainObject(value) &&
    (value.use === "toon" || value.use === "original") &&
    (value.format === null ||
      value.format === "json" ||
      value.format === "yaml" ||
      value.format === "toml") &&
    typeof value.originalTokens === "number" &&
    typeof value.toonTokens === "number" &&
    typeof value.reason === "string"
  );
}

function wrap(stdin: string, args = ["--stdin", "--json"]) {
  return spawnSync("bun", [CLI, "toon", "wrap", ...args], { encoding: "utf8", input: stdin });
}

/** The envelope's data; an exit other than 0 or an envelope other than ok
 * throws, so every scenario also proves that both answers exit 0. */
function wrapData(stdin: string): Wrap {
  const result = wrap(stdin);
  const envelope = envelopeOf(result.stdout);
  if (
    result.status !== 0 ||
    envelope.code !== "ok" ||
    envelope.exit !== 0 ||
    !isWrap(envelope.data)
  ) {
    throw new Error(`toon wrap exited ${result.status}: ${result.stdout}${result.stderr}`);
  }
  return envelope.data;
}

const ROWS = Array.from({ length: 200 }, (_, i) => ({
  number: i + 1,
  title: `Fix the thing number ${i + 1} properly`,
  author: `someone-${i % 7}`,
  state: "OPEN",
}));

function yamlTable(): string {
  return ROWS.map(
    (r) => `- number: ${r.number}\n  title: ${r.title}\n  author: ${r.author}\n  state: ${r.state}`,
  ).join("\n");
}

function tomlTable(): string {
  return ROWS.map(
    (r) =>
      `[[rows]]\nnumber = ${r.number}\ntitle = "${r.title}"\nauthor = "${r.author}"\nstate = "${r.state}"\n`,
  ).join("\n");
}

function nested(depth: number): string {
  let value: unknown = "leaf";
  for (let i = 0; i < depth; i += 1) {
    value = { [`k${i}`]: value, [`a${i}`]: [i, { z: i }] };
  }
  return JSON.stringify(value);
}

describe("qsm-usage toon wrap", () => {
  test("A JSON table on stdin: converted to TOON", () => {
    const data = wrapData(JSON.stringify(ROWS, null, 2));
    expect(data).toMatchObject({ use: "toon", format: "json" });
    expect(data.toon).toStartWith("[200]{number,title,author,state}:");
    expect(data.toonTokens).toBeLessThanOrEqual(data.originalTokens * 0.8);
  });

  test("A YAML table on stdin: converted to TOON", () => {
    const data = wrapData(yamlTable());
    expect(data).toMatchObject({ use: "toon", format: "yaml" });
    expect(data.toon).toStartWith("[200]{number,title,author,state}:");
  });

  test("A TOML table on stdin: converted to TOON", () => {
    const data = wrapData(tomlTable());
    expect(data).toMatchObject({ use: "toon", format: "toml" });
    expect(data.toon).toContain("rows[200]{number,title,author,state}:");
  });

  test("Plain text is not structured", () => {
    const text = "The build finished without errors and every test passed.\n".repeat(120);
    const data = wrapData(text);
    expect(data).toMatchObject({ use: "original", format: null });
    expect(data.toon).toBeUndefined();
    expect(data.reason).toContain("not structured");
  });

  test("A small JSON table: the original is kept, under the threshold", () => {
    const data = wrapData(JSON.stringify(ROWS.slice(0, 3)));
    expect(data).toMatchObject({ use: "original", format: "json" });
    expect(data.toon).toBeUndefined();
    expect(data.reason).toContain("threshold");
  });

  test("Nested JSON whose TOON form is larger: the original is kept", () => {
    const data = wrapData(nested(160));
    expect(data).toMatchObject({ use: "original", format: "json" });
    expect(data.originalTokens).toBeGreaterThan(1000);
    expect(data.toon).toBeUndefined();
    expect(data.reason).toContain("20%");
  });

  test("Without --stdin the call is usage, exit 2", () => {
    expect(wrap("[]", ["--json"]).status).toBe(2);
  });
});
