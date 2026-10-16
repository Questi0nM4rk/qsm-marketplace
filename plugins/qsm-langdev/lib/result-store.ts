// The result store: every checker result a run scored, kept under `.qsm-langdev/results/` in the
// checkout being checked, so no checker scores the same content twice.

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { cacheDir, writeAtomic } from "./cache-dir.ts";
import type { Finding, Tally } from "./findings.ts";
import { isRecord } from "../../../lib/outcome.ts";
import { isErrno, recordOf } from "./json.ts";
import type { EnforcementPoint } from "./registry.ts";

/**
 * What a checker's run over one side comes to: a tally and the tool's own words, or the reason it
 * could not be read.
 */
export type Score =
  | { tally: Tally; output: string }
  | { reason: string; timedOut?: true; failedRun?: true };

/** The stored form of a score, raised whenever what a stored score means changes (its form, or
 * the inputs a side is scored with), so an entry an older qsm-langdev wrote is scored again. */
const SHAPE = 3;

/** How much of one side came from the store and how much was scored. */
export interface SideUse {
  hits: number;
  scored: number;
}

/** One checker's use of the store in a run. `reference` is null when the run
 * had no reference side; `notStored` says why this checker is never stored. */
export interface StoreUse {
  checker: string;
  reference: SideUse | null;
  shipped: SideUse;
  notStored?: string;
}

export interface StoreReport {
  checkers: StoreUse[];
  /** The first write that failed, when one did: the next run scores it again. */
  unwritten?: string;
}

/** Everything one checker's entries on one side are keyed by, besides the
 * content: its name, its tool version, and its configuration's hash. */
export interface Keying {
  checker: string;
  version: string;
  config: string;
}

/** Each part length-prefixed, so no two part lists hash alike. */
function hashOf(parts: readonly (string | Buffer)[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(`${Buffer.byteLength(part)}\0`);
    hash.update(part);
  }
  return hash.digest("hex");
}

function contentOf(root: string, path: string): string | Buffer {
  try {
    return readFileSync(join(root, path));
  } catch (error) {
    // A path that cannot be read hashes as its failure: the checker will
    // meet the same failure, and a later readable copy is new content.
    return `\0unreadable ${(isErrno(error) ? error.code : undefined) ?? "error"}`;
  }
}

/** The hash of `files` under `root`: every path with its content, in path
 * order, so the same files in any order are the same content. */
export function contentHash(root: string, files: readonly string[]): string {
  const sorted = files.toSorted();
  return hashOf(sorted.flatMap((path) => [path, contentOf(root, path)]));
}

/** The hash of what a checker was told and what it read besides the scored
 * files: its argv with those files taken out, and every config file of the
 * side's tree that one of `patterns` matches, path and content. */
export function configHash(
  root: string,
  treeFiles: readonly string[],
  patterns: readonly string[],
  argv: readonly string[],
): string {
  const globs = patterns.map((pattern) => new Glob(pattern));
  const read = treeFiles.filter((path) => globs.some((glob) => glob.match(path)));
  return hashOf([JSON.stringify(argv), contentHash(root, read)]);
}

function isFinding(value: unknown): value is Finding {
  if (!isRecord(value)) {
    return false;
  }
  const { identity, locations } = value;
  return (
    typeof identity === "string" &&
    Array.isArray(locations) &&
    locations.every(
      (l: unknown) =>
        isRecord(l) &&
        typeof l.path === "string" &&
        ["number", "undefined"].includes(typeof l.line) &&
        ["number", "undefined"].includes(typeof l.column),
    )
  );
}

function isTally(value: unknown): value is Tally {
  if (!isRecord(value)) {
    return false;
  }
  const { total, byPath, findings } = value;
  const countsByPath =
    byPath === undefined ||
    (typeof byPath === "object" &&
      byPath !== null &&
      Object.values(byPath).every((n) => typeof n === "number"));
  const findingList =
    findings === undefined || (Array.isArray(findings) && findings.every(isFinding));
  return typeof total === "number" && countsByPath && findingList;
}

/** The stored score in `text`, or null when it is not one of this shape. */
function parseEntry(text: string): Score | null {
  try {
    const entry: unknown = JSON.parse(text);
    const record = recordOf(entry);
    if (record === null) {
      return null;
    }
    const { shape, tally, output } = record;
    return shape === SHAPE && isTally(tally) && typeof output === "string"
      ? { tally, output }
      : null;
  } catch {
    return null;
  }
}

/** A tmp file older than this was left by a killed run. */
const ABANDONED_TMP_MS = 10 * 60 * 1000;

/** The store of one checkout for one run at one enforcement point. */
export class ResultStore {
  readonly #root: string;
  readonly #point: EnforcementPoint;
  readonly #used = new Map<string, Set<string>>();
  readonly #inFlight = new Map<string, Promise<Score>>();
  #unwritten: string | undefined;

  constructor(root: string, point: EnforcementPoint) {
    this.#root = root;
    this.#point = point;
  }

  #checkerDir(checker: string): string {
    return join(cacheDir(this.#root, "results"), checker);
  }

  #dir(checker: string): string {
    return join(this.#checkerDir(checker), this.#point);
  }

  /**
   * The score for `content` under `keying`: a stored one, one another side of this run is already
   * scoring, or `compute`'s, stored when it is a tally.
   */
  through(
    keying: Keying | null,
    content: string,
    compute: () => Promise<Score>,
    use: SideUse,
  ): Promise<Score> {
    if (keying === null) {
      use.scored += 1;
      return compute();
    }
    const key = hashOf([keying.checker, keying.version, keying.config, content]);
    const used = this.#used.get(keying.checker) ?? new Set<string>();
    this.#used.set(keying.checker, used);
    used.add(key);
    const flying = this.#inFlight.get(key);
    if (flying !== undefined) {
      use.hits += 1;
      return flying;
    }
    const entry = join(this.#dir(keying.checker), `${key}.json`);
    const stored = this.#read(entry);
    if (stored !== null) {
      use.hits += 1;
      return Promise.resolve(stored);
    }
    use.scored += 1;
    const scoring = compute().then((score) => {
      if ("tally" in score) {
        this.#write(entry, score);
      }
      return score;
    });
    this.#inFlight.set(key, scoring);
    return scoring;
  }

  #read(entry: string): Score | null {
    try {
      return parseEntry(readFileSync(entry, "utf8"));
    } catch {
      return null;
    }
  }

  #write(entry: string, score: { tally: Tally; output: string }): void {
    try {
      mkdirSync(join(entry, ".."), { recursive: true });
      writeAtomic(
        entry,
        JSON.stringify({ shape: SHAPE, tally: score.tally, output: score.output }),
      );
    } catch (error) {
      this.#unwritten ??= `${entry}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /** For every checker this run looked up, removes the entries at the run's
   * point it did not use, tmp files a killed run left, and every entry kept
   * outside a point's directory, where the store kept them before points were
   * kept apart. A concurrent run's fresh entry may go too: that is a miss for
   * the next run, never a wrong answer. */
  prune(): void {
    const none = new Set<string>();
    for (const [checker, used] of this.#used) {
      this.#sweep(this.#dir(checker), used);
      this.#sweep(this.#checkerDir(checker), none);
    }
  }

  /** Removes from `dir` every entry not in `used` and every abandoned tmp
   * file; the directories in it stay. */
  #sweep(dir: string, used: ReadonlySet<string>): void {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (this.#stale(dir, name, used)) {
        try {
          unlinkSync(join(dir, name));
        } catch {
          // Gone already: another run pruned it.
        }
      }
    }
  }

  #stale(dir: string, name: string, used: ReadonlySet<string>): boolean {
    if (name.endsWith(".json")) {
      return !used.has(name.slice(0, -".json".length));
    }
    if (!name.endsWith(".tmp")) {
      return false;
    }
    try {
      return statSync(join(dir, name)).mtimeMs < Date.now() - ABANDONED_TMP_MS;
    } catch {
      return false;
    }
  }

  /** The first write that failed, if any. */
  get unwritten(): string | undefined {
    return this.#unwritten;
  }
}

function describeSide(use: SideUse): string {
  const { hits, scored } = use;
  if (hits + scored === 0) {
    return "empty";
  }
  if (hits + scored === 1) {
    return hits === 1 ? "hit" : "scored";
  }
  if (scored === 0) {
    return `${hits} hits`;
  }
  if (hits === 0) {
    return `${scored} scored`;
  }
  return `${hits} ${hits === 1 ? "hit" : "hits"}, ${scored} scored`;
}

/** One line per checker, then the run's total:
 * `store: oxlint: reference hit, shipped scored` ... `store: 3 hits, 2 scored`. */
export function describeStore(report: StoreReport): string[] {
  let hits = 0;
  let scored = 0;
  const lines = report.checkers.map((use) => {
    const sides = [use.reference, use.shipped].filter((s): s is SideUse => s !== null);
    for (const side of sides) {
      hits += side.hits;
      scored += side.scored;
    }
    const parts = [
      ...(use.reference === null ? [] : [`reference ${describeSide(use.reference)}`]),
      `shipped ${describeSide(use.shipped)}`,
    ].join(", ");
    const why = use.notStored === undefined ? "" : ` not stored (${use.notStored}):`;
    return `store: ${use.checker}:${why} ${parts}`;
  });
  const unwritten = report.unwritten === undefined ? "" : `; not written: ${report.unwritten}`;
  return [...lines, `store: ${hits} ${hits === 1 ? "hit" : "hits"}, ${scored} scored${unwritten}`];
}
