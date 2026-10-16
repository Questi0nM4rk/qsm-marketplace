// The headline claim: the frame serves the last known git state and starts the
// refresh behind it, and a cache it cannot write costs the segment rather than
// the frame. Both are asserted here, on the composition itself.

import { describe, expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { writeCache } from "./cache.ts";
import type { GitState } from "./git.ts";
import { abandonRefresh, claimRefresh, gitCacheName, resolveGit, storeGit } from "./gitcache.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

/** A cache directory under a parent nobody may write into: a full disk, a
 * read-only temporary directory, or one another account owns. The parent stays
 * empty, so removing it needs no unsealing. */
function unwritableCacheDir(): string {
  const parent = sandboxDir("qsm-statusline-gitcache-");
  chmodSync(parent, 0o500);
  return join(parent, "cache");
}

const NOW = 1_800_000_000_000;
const MAX_AGE_MS = 2000;
const CWD = "/home/user/project";
const STATE: GitState = { branch: "main", staged: 1, modified: 2, untracked: 0, conflicts: 0 };

describe("resolveGit", () => {
  test("a cold cache has nothing to serve and asks for a refresh", () => {
    expect(resolveGit(sandboxDir("qsm-statusline-gitcache-"), CWD, NOW, MAX_AGE_MS)).toEqual({
      state: null,
      stale: true,
    });
  });

  test("a cache written inside the window is served and no refresh is due", () => {
    const dir = sandboxDir("qsm-statusline-gitcache-");
    storeGit(dir, CWD, STATE, NOW);
    expect(resolveGit(dir, CWD, NOW + 1999, MAX_AGE_MS)).toEqual({ state: STATE, stale: false });
  });

  test("a cache past the window is still served, and a refresh is due behind it", () => {
    // The whole design: the frame prints the last known counters immediately
    // and the refresher catches up afterwards.
    const dir = sandboxDir("qsm-statusline-gitcache-");
    storeGit(dir, CWD, STATE, NOW);
    expect(resolveGit(dir, CWD, NOW + 60_000, MAX_AGE_MS)).toEqual({ state: STATE, stale: true });
  });

  test("the recorded null of a directory that is no repository is served as null", () => {
    const dir = sandboxDir("qsm-statusline-gitcache-");
    storeGit(dir, CWD, null, NOW);
    expect(resolveGit(dir, CWD, NOW, MAX_AGE_MS)).toEqual({ state: null, stale: false });
  });

  test("a body this build cannot parse is nothing cached, not a throw", () => {
    const dir = sandboxDir("qsm-statusline-gitcache-");
    writeCache(dir, gitCacheName(CWD), "half a json", NOW);
    expect(resolveGit(dir, CWD, NOW, MAX_AGE_MS)).toEqual({ state: null, stale: true });
  });

  test("one directory's cache is not another's", () => {
    const dir = sandboxDir("qsm-statusline-gitcache-");
    storeGit(dir, CWD, STATE, NOW);
    expect(resolveGit(dir, `${CWD}/nested`, NOW, MAX_AGE_MS).state).toBeNull();
  });

  test("a cache directory that cannot be read leaves the segment empty", () => {
    expect(resolveGit(unwritableCacheDir(), CWD, NOW, MAX_AGE_MS)).toEqual({
      state: null,
      stale: true,
    });
  });
});

describe("claimRefresh", () => {
  test("the first frame claims it and the next one is turned away", () => {
    const dir = sandboxDir("qsm-statusline-gitcache-");
    expect(claimRefresh(dir, CWD, NOW)).toBe(true);
    expect(claimRefresh(dir, CWD, NOW)).toBe(false);
  });

  test("an abandoned claim is free again at once", () => {
    const dir = sandboxDir("qsm-statusline-gitcache-");
    expect(claimRefresh(dir, CWD, NOW)).toBe(true);
    abandonRefresh(dir, CWD);
    expect(claimRefresh(dir, CWD, NOW)).toBe(true);
  });

  test("a cache directory that cannot be written claims nothing and throws nothing", () => {
    const dir = unwritableCacheDir();
    expect(claimRefresh(dir, CWD, NOW)).toBe(false);
    expect(() => {
      abandonRefresh(dir, CWD);
    }).not.toThrow();
  });
});

describe("storeGit", () => {
  test("a stored body reports true and releases the claim", () => {
    const dir = sandboxDir("qsm-statusline-gitcache-");
    expect(claimRefresh(dir, CWD, NOW)).toBe(true);
    expect(storeGit(dir, CWD, STATE, NOW)).toBe(true);
    expect(claimRefresh(dir, CWD, NOW)).toBe(true);
  });

  test("a cache directory that cannot be written reports false, and the refresher lives", () => {
    expect(storeGit(unwritableCacheDir(), CWD, STATE, NOW)).toBe(false);
  });

  test("a directory that exists but is sealed is the same answer", () => {
    const dir = sandboxDir("qsm-statusline-gitcache-");
    chmodSync(dir, 0o500);
    expect(storeGit(dir, CWD, STATE, NOW)).toBe(false);
  });
});
