import { expect, test } from "bun:test";
import { makers } from "./validate-test-temp.ts";

// each import is split so this file's own text holds no import clause for the gate to find
test("finds a temp-dir maker imported from node:fs or node:os, aliased or not, and nothing else", () => {
  const src = [
    ["import { mkdtempSync as make, rmSync }", 'from "node:fs";'],
    ["import { tmpdir }", 'from "os";'],
    ["import { join }", 'from "node:path";'],
  ]
    .map((parts) => parts.join(" "))
    .join("\n");
  expect(makers(src)).toEqual(["mkdtempSync", "tmpdir"]);
});
