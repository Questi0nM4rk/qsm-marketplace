import { describe, expect, test } from "bun:test";
import { closeSync, openSync } from "node:fs";
import { join } from "node:path";
import { tryLock } from "./fs.ts";
import { sandboxDir } from "./fixtures/sandbox.ts";

describe("tryLock", () => {
  test("a second descriptor on a held lock file is refused until the holder closes", () => {
    const file = join(sandboxDir("qsm-lock-"), "x.lock");
    const holder = openSync(file, "a");
    const other = openSync(file, "a");
    try {
      expect(tryLock(holder)).toBe(true);
      expect(tryLock(other)).toBe(false);
      closeSync(holder);
      expect(tryLock(other)).toBe(true);
    } finally {
      closeSync(other);
    }
  });
});
