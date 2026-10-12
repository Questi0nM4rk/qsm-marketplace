// `search`: full text over what was said, whole machine by
// default. Spec: "Search is full text over what was said".

import type { Database } from "bun:sqlite";
import { basename } from "node:path";
import { projectOf } from "./project.ts";

export interface SearchOptions {
  readonly limit?: number | undefined;
  /** `7d`, or an ISO date: sessions that ended after it */
  readonly since?: string | undefined;
  readonly project?: string | undefined;
  readonly now?: number | undefined;
}

export interface Hit {
  readonly sessionId: string;
  readonly seq: number;
  readonly role: string;
  readonly date: string;
  readonly project: string;
  readonly title: string;
  readonly snippet: string;
  readonly score: number;
}

interface Row {
  readonly session_id: string;
  readonly seq: number;
  readonly role: string;
  readonly project: string;
  readonly title: string;
  readonly ended_at: string;
  readonly bm: number;
  readonly snippet: string;
}

// Function words in English and Czech short and common enough that a prefix
// match against them hits nearly every row.
const STOPWORDS = new Set(["the", "is", "are", "was", "were"]);
const OVERFETCH = 200;
const FRESH_WEIGHT = 0.5;
const FRESH_FADE_DAYS = 90;
const DAY_MS = 86_400_000;

/** FTS5 MATCH text: every run of 2+ letters or digits, minus stopwords,
 * as a prefix match, OR'd; null when nothing usable remains. */
export function ftsQuery(query: string): string | null {
  const terms = query
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.toLowerCase())
    .filter((term) => term.length >= 2 && !STOPWORDS.has(term))
    .map((term) => `${term}*`);
  if (terms.length === 0) {
    return null;
  }
  return `(${terms.join(" OR ")})`;
}

/** `7d` -> now minus seven days; anything else is parsed as a date. Null
 * when it parses as neither. */
export function sinceCutoff(since: string, now: number): string | null {
  const days = /^(\d+)d$/.exec(since);
  if (days?.[1] !== undefined) {
    return new Date(now - Number(days[1]) * DAY_MS).toISOString();
  }
  const parsed = Date.parse(since);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function freshness(endedAt: string, now: number): number {
  const ageDays = Math.max(0, (now - Date.parse(endedAt)) / DAY_MS);
  return 1 - Math.min(ageDays, FRESH_FADE_DAYS) / FRESH_FADE_DAYS;
}

const SQL = `SELECT t.session_id, t.seq, t.role, s.project, s.title, s.ended_at,
  bm25(turns_fts) AS bm, snippet(turns_fts, -1, '[', ']', '…', 16) AS snippet
  FROM turns_fts JOIN turns t ON t.rowid = turns_fts.rowid JOIN sessions s ON s.id = t.session_id
  WHERE turns_fts MATCH ?1
    AND (?2 IS NULL OR s.ended_at >= ?2) AND (?3 IS NULL OR s.project = ?3)
  ORDER BY bm LIMIT ${OVERFETCH}`;

export function search(db: Database, query: string, options: SearchOptions = {}): Hit[] {
  const now = options.now ?? Date.now();
  const match = ftsQuery(query);
  if (match === null) {
    return [];
  }
  const cutoff = options.since === undefined ? null : sinceCutoff(options.since, now);
  const rows = db
    .query<Row, [string, string | null, string | null]>(SQL)
    .all(match, cutoff, options.project === undefined ? null : projectOf(options.project));
  return rank(rows, now, options.limit ?? 10);
}

function rank(rows: readonly Row[], now: number, limit: number): Hit[] {
  return rows
    .map((row) => ({
      sessionId: row.session_id,
      seq: row.seq,
      role: row.role,
      date: row.ended_at.slice(0, 10),
      project: row.project,
      title: row.title,
      snippet: row.snippet.replace(/\s+/g, " ").trim(),
      score: -row.bm + FRESH_WEIGHT * freshness(row.ended_at, now),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export const NO_MATCH = "no session matches";

export function formatHits(hits: readonly Hit[]): string {
  if (hits.length === 0) {
    return NO_MATCH;
  }
  return hits
    .map(
      (hit) =>
        `${hit.date} ${basename(hit.project)} ${hit.sessionId} #${hit.seq} ${hit.title}\n  ${hit.snippet}`,
    )
    .join("\n");
}
