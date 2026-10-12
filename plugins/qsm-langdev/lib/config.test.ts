// `isLangdevRepo` (a repository never gates until its own gates.json is on
// disk) and `languageEnabled` (opt-in: a language runs only when named,
// never because the selection happens to be empty). Every repository is a
// sandbox under the system temp directory, removed after each test whether
// the test passed or failed.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isLangdevRepo, languageEnabled } from "./config.ts";

const sandboxes: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "qsm-langdev-config-"));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  while (sandboxes.length > 0) {
    rmSync(sandboxes.pop() ?? "", { recursive: true, force: true });
  }
});

describe("isLangdevRepo", () => {
  test("false when the repository never wrote .qsm-langdev/gates.json", () => {
    expect(isLangdevRepo(sandbox())).toBe(false);
  });

  test("true once gates.json is on disk, whatever it holds", () => {
    const root = sandbox();
    mkdirSync(join(root, ".qsm-langdev"), { recursive: true });
    writeFileSync(join(root, ".qsm-langdev", "gates.json"), "{}\n");

    expect(isLangdevRepo(root)).toBe(true);
  });
});

describe("languageEnabled", () => {
  test("An empty selection gates nothing ordinary", () => {
    expect(languageEnabled("ts", [])).toBe(false);
    expect(languageEnabled("py", [])).toBe(false);
  });

  test("an always-on language runs regardless of the selection", () => {
    expect(languageEnabled("docs", [])).toBe(true);
    expect(languageEnabled("multi", [])).toBe(true);
  });

  test("a non-empty selection enables only what it names", () => {
    expect(languageEnabled("ts", ["ts"])).toBe(true);
    expect(languageEnabled("py", ["ts"])).toBe(false);
  });
});
