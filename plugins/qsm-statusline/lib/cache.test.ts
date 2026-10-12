import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cacheDir,
  cacheKey,
  isFresh,
  LOCK_TTL_MS,
  readCache,
  tryLock,
  writeCache,
} from "./cache.ts";

// Every sandbox this file makes is removed after the test that made it,
// passing or failing: a `finally` inside one test would leave the rest.
const sandboxes: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "qsm-statusline-cache-"));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of sandboxes.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const NOW = 1_800_000_000_000;

describe("readCache and writeCache", () => {
  test("a body written now reads back with no age", () => {
    const dir = sandbox();
    writeCache(dir, "git", '{"branch":"main"}', NOW);
    expect(readCache(dir, "git", NOW)).toEqual({ ageMs: 0, body: '{"branch":"main"}' });
  });

  test("the age is measured against the stamp the write left", () => {
    const dir = sandbox();
    writeCache(dir, "git", "body", NOW - 5000);
    expect(readCache(dir, "git", NOW)?.ageMs).toBe(5000);
  });

  test("nothing on disk is nothing to render, not a failure", () => {
    expect(readCache(sandbox(), "git", NOW)).toBeNull();
  });

  test("a file in a layout this build does not read is treated as nothing", () => {
    const dir = sandbox();
    writeFileSync(join(dir, "git"), "no stamp here\nbody");
    expect(readCache(dir, "git", NOW)).toBeNull();
  });
});

describe("isFresh", () => {
  test("fresh under the window, stale at it and past it", () => {
    expect(isFresh({ ageMs: 1999, body: "" }, 2000)).toBe(true);
    expect(isFresh({ ageMs: 2000, body: "" }, 2000)).toBe(false);
  });

  test("a stamp in the future is stale, not fresh forever", () => {
    // A clock stepped back over an adjustment or a resume leaves one behind.
    expect(isFresh({ ageMs: -60_000, body: "" }, 2000)).toBe(false);
  });
});

describe("tryLock", () => {
  test("the first caller takes the lock and the next one is turned away", () => {
    const dir = sandbox();
    expect(tryLock(dir, "git", NOW)).toBe(true);
    expect(tryLock(dir, "git", NOW)).toBe(false);
  });

  test("a lock nobody released expires, so one killed refresher cannot wedge a segment", () => {
    const dir = sandbox();
    expect(tryLock(dir, "git", NOW)).toBe(true);
    expect(tryLock(dir, "git", NOW + LOCK_TTL_MS)).toBe(true);
  });
});

describe("cacheKey", () => {
  test("two directories differing only at the end get different names", () => {
    const deep = "/home/user/projects/thing/with/a/very/long/path/that/keeps/going";
    expect(cacheKey("git", `${deep}/a`)).not.toBe(cacheKey("git", `${deep}/b`));
  });

  test("a name stays short enough to be a filename whatever the path was", () => {
    expect(cacheKey("git", "/a".repeat(500)).length).toBeLessThan(32);
  });
});

describe("cacheDir", () => {
  test("the QSM override wins, and an empty one does not", () => {
    expect(cacheDir({ QSM_STATUSLINE_CACHE_DIR: "/tmp/chosen" })).toBe("/tmp/chosen");
    expect(cacheDir({ QSM_STATUSLINE_CACHE_DIR: "" })).toContain("qsm-statusline-");
  });
});
