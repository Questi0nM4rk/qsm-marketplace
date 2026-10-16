import { describe, expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { converterFor, missingConverter, onPath } from "./converters.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

/** A directory of fake binaries, to be put in front of the real PATH. */
function fakeBinDir(commands: readonly string[]): string {
  const dir = sandboxDir("qsm-book-to-skill-bin-");
  for (const command of commands) {
    const path = join(dir, command);
    writeFileSync(path, "#!/bin/sh\nexit 0\n");
    chmodSync(path, 0o755);
  }
  return dir;
}

describe("onPath", () => {
  test("finds an executable file in a PATH entry", () => {
    expect(onPath("pandoc", fakeBinDir(["pandoc"]))).toBe(true);
  });

  test("a file without the execute bit is not a command", () => {
    const dir = fakeBinDir([]);
    writeFileSync(join(dir, "pandoc"), "not executable");
    chmodSync(join(dir, "pandoc"), 0o644);
    expect(onPath("pandoc", dir)).toBe(false);
  });

  test("an empty PATH finds nothing", () => {
    expect(onPath("pandoc", "")).toBe(false);
  });
});

describe("missingConverter", () => {
  test("a reader this process handles itself needs nothing", () => {
    expect(missingConverter("text", "")).toBeNull();
    expect(missingConverter("html", "")).toBeNull();
  });

  test("an installed converter reports no problem", () => {
    expect(missingConverter("ebook-convert", fakeBinDir(["ebook-convert"]))).toBeNull();
  });

  test("a missing converter names the binary and what installs it", () => {
    const reason = missingConverter("ebook-convert", fakeBinDir([]));
    expect(reason).toContain("ebook-convert");
    expect(reason).toContain("calibre");
  });
});

describe("converterFor", () => {
  test("maps a binary-backed reader to its converter", () => {
    expect(converterFor("pdftotext")?.formats).toEqual([".pdf"]);
    expect(converterFor("text")).toBeNull();
  });
});
