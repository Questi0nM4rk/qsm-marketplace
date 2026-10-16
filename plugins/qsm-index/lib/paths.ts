// Where a repository's index lands: one cache directory per repository path.

import { createHash } from "node:crypto";
import { join } from "node:path";
import { home } from "../../../lib/paths.ts";

export type Env = Record<string, string | undefined>;

/** The cache every index lands under. */
export function cacheRoot(env: Env): string {
  return env.QSM_INDEX_CACHE_DIR ?? join(home(env), ".cache", "qsm-index");
}

/** Stable 12-hex-character digest of an absolute path. */
export function pathHash(absPath: string): string {
  return createHash("sha256").update(absPath).digest("hex").slice(0, 12);
}

/** The files of one repository's cache directory. */
export interface CacheFiles {
  readonly dir: string;
  readonly lock: string;
  readonly status: string;
  readonly log: string;
  /** What `<repo>/graphify-out` links to; graphify writes the graph here. */
  readonly graph: string;
  /** Empty marker: the person said no to indexing this repository. */
  readonly declined: string;
  /** The distinct files edited since the last build started, one absolute path per line. */
  readonly edits: string;
}

/** `<cache>/<pathHash>/` of a repository's top level, and the names of the files in it. */
export function cacheFiles(top: string, env: Env): CacheFiles {
  const dir = join(cacheRoot(env), pathHash(top));
  return {
    dir,
    lock: join(dir, "build.lock"),
    status: join(dir, "status.json"),
    log: join(dir, "build.log"),
    graph: join(dir, "graphify-out"),
    declined: join(dir, "declined"),
    edits: join(dir, "edits"),
  };
}
