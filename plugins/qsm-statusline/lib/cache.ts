// Nothing blocks a frame.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAtomic } from "../../../lib/fs.ts";

export interface CacheEntry {
  readonly ageMs: number;
  readonly body: string;
}

const STAMP = /^\d+$/;
/**
 * Past every command this guards, and short enough that a refresher killed without running its
 * cleanup heals within the minute.
 */
export const LOCK_TTL_MS = 60_000;

/** A directory path is not a filename: a deep path overruns the limit and two
 * paths differing late collide when truncated. The digest is neither. */
export function cacheKey(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

/** `QSM_STATUSLINE_CACHE_DIR` overrides it; the default is per user, because
 * a shared temporary directory is another account's to write into. */
export function cacheDir(env: Record<string, string | undefined>): string {
  const override = env.QSM_STATUSLINE_CACHE_DIR;
  if (override !== undefined && override.length > 0) {
    return override;
  }
  return join(tmpdir(), `qsm-statusline-${process.getuid?.() ?? 0}`);
}

function stampOf(raw: string): { stamp: number; body: string } | null {
  const cut = raw.indexOf("\n");
  const head = cut === -1 ? raw : raw.slice(0, cut);
  if (!STAMP.test(head)) {
    return null;
  }
  return { stamp: Number(head), body: cut === -1 ? "" : raw.slice(cut + 1) };
}

/** null means there is nothing usable on disk: no file, or one written in a
 * layout this build does not read. Either way the caller renders without it. */
export function readCache(dir: string, name: string, now: number): CacheEntry | null {
  let raw: string;
  try {
    raw = readFileSync(join(dir, name), "utf8");
  } catch {
    return null;
  }
  const parsed = stampOf(raw);
  if (parsed === null) {
    return null;
  }
  return { ageMs: now - parsed.stamp, body: parsed.body };
}

/** Written to a sibling and renamed, so a frame never reads half a body. */
export function writeCache(dir: string, name: string, body: string, now: number): void {
  mkdirSync(dir, { recursive: true });
  writeAtomic(join(dir, name), `${now}\n${body}`);
}

export function isFresh(entry: CacheEntry, maxAgeMs: number): boolean {
  // A negative age means the stamp sits in the future, which happens when the clock steps back over
  // an adjustment or a resume. Treat it as stale rather than as fresh until wall-clock catches up.
  return entry.ageMs >= 0 && entry.ageMs < maxAgeMs;
}

/** true when this caller took the lock and should start the refresh; false
 * when another one holds a lock that has not expired. */
export function tryLock(dir: string, name: string, now: number): boolean {
  mkdirSync(dir, { recursive: true });
  const held = readCache(dir, `${name}.lock`, now);
  if (held !== null && isFresh(held, LOCK_TTL_MS)) {
    return false;
  }
  writeCache(dir, `${name}.lock`, "", now);
  return true;
}

export function releaseLock(dir: string, name: string): void {
  rmSync(join(dir, `${name}.lock`), { force: true });
}
