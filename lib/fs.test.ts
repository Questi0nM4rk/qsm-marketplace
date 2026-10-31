import { describe, expect, test } from "bun:test";
import { closeSync, openSync } from "node:fs";
import { join } from "node:path";
import { tryFlock } from "./fs.ts";
import { sandboxDir } from "./fixtures/sandbox.ts";

describe("tryFlock", () => {
  test("a second descriptor on a held lock file is refused until the holder closes", () => {
    const file = join(sandboxDir("qsm-lock-"), "x.lock");
    const holder = openSync(file, "a");
    const other = openSync(file, "a");
    try {
      expect(tryFlock(holder)).toBe(true);
      expect(tryFlock(other)).toBe(false);
      closeSync(holder);
      expect(tryFlock(other)).toBe(true);
    } finally {
      closeSync(other);
    }
  });
});
