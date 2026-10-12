// The git segment's cache-first resolution: what this frame serves, and who is allowed to go and
// make it fresher.

import { cacheKey, isFresh, readCache, releaseLock, tryLock, writeCache } from "./cache.ts";
import type { GitState } from "./git.ts";

export interface GitResolution {
  /**
   * The last known state, or null when nothing usable is cached and the segment is omitted this
   * frame.
   */
  readonly state: GitState | null;
  /** Missing, unreadable, or past its window: the caller's cue to start a
   * refresh behind the frame. */
  readonly stale: boolean;
}

export function gitCacheName(cwd: string): string {
  return cacheKey("git", cwd);
}

/** Serves the cache and says whether a refresh is due. A body written by a
 * layout this build does not read counts as nothing cached. */
export function resolveGit(dir: string, cwd: string, now: number, maxAgeMs: number): GitResolution {
  const entry = readCache(dir, gitCacheName(cwd), now);
  if (entry === null) {
    return { state: null, stale: true };
  }
  const stale = !isFresh(entry, maxAgeMs);
  try {
    return { state: JSON.parse(entry.body) as GitState | null, stale };
  } catch {
    return { state: null, stale: true };
  }
}

/** true when this caller took the lock and should start the refresher. */
export function claimRefresh(dir: string, cwd: string, now: number): boolean {
  try {
    return tryLock(dir, gitCacheName(cwd), now);
  } catch {
    // Nowhere to put a lock is nowhere to put a cache either, so a refresh
    // would have nothing to write.
    return false;
  }
}

/** Hands the lock back when the refresher never started, so the next frame
 * tries again instead of waiting out the lock's minute. */
export function abandonRefresh(dir: string, cwd: string): void {
  try {
    releaseLock(dir, gitCacheName(cwd));
  } catch {
    // A lock that cannot be removed expires on its own.
  }
}

/**
 * Records what git answered, including the null that means "not a repository", and releases the
 * lock whether or not the write landed.
 */
export function storeGit(dir: string, cwd: string, state: GitState | null, now: number): boolean {
  let stored = false;
  try {
    writeCache(dir, gitCacheName(cwd), JSON.stringify(state), now);
    stored = true;
  } catch {
    // The next frame reads the previous body, or none, and asks again.
    stored = false;
  }
  abandonRefresh(dir, cwd);
  return stored;
}
