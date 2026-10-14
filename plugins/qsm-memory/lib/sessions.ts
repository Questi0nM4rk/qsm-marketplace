// `show` and `list`: reading the archive. Spec: "Show reads the saved text, or the transcript
// file for the full context", "List answers what was done when".

import type { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { fail } from "./errors.ts";
import { projectOf } from "./project.ts";
import { sinceCutoff } from "./search.ts";
import { fullTurns, type Turn } from "./transcript.ts";

export interface SessionRow {
  readonly id: string;
  readonly cwd: string;
  readonly project: string;
  readonly title: string;
  readonly started_at: string;
  readonly ended_at: string;
  readonly transcript_path: string;
  readonly saved_at: string;
  readonly turn_count: number;
}

/** The one session whose id starts with `prefix`. */
export function resolveSession(db: Database, prefix: string): SessionRow {
  const rows = db
    .query<SessionRow, [string]>("SELECT * FROM sessions WHERE id LIKE ?1 || '%' LIMIT 2")
    .all(prefix);
  const [first, second] = rows;
  if (first === undefined) {
    fail("not-found", `no session starts with ${prefix}`, "run qsm-memory list");
  }
  if (second !== undefined) {
    fail("ambiguous", `more than one session starts with ${prefix}`, "give more of the id");
  }
  return first;
}

export interface ShowOptions {
  /** read the transcript file on disk: tool calls and results too */
  readonly full?: boolean | undefined;
  /** inclusive turn window */
  readonly lines?: readonly [number, number] | undefined;
}

const SHOW_WINDOW = 200;
/** Characters of turns one show prints, so a whole session never lands in the reader's context. */
const SHOW_CHARS = 20_000;

function turnLine(seq: number, turn: Turn): string {
  if (turn.kind === "tool_use") {
    return `#${seq} tool ${turn.tool ?? ""} ${turn.text}`;
  }
  if (turn.kind === "tool_result") {
    return `#${seq} result: ${turn.text}`;
  }
  return `#${seq} ${turn.role}: ${turn.text}`;
}

function header(session: SessionRow): string {
  return `${session.id} ${session.ended_at.slice(0, 10)} ${basename(session.project)}: ${session.title}`;
}

/** The turns of the saved text, numbered as saved. */
function savedTurns(db: Database, session: SessionRow): [number, Turn][] {
  return db
    .query<{ seq: number; role: Turn["role"]; text: string }, [string]>(
      "SELECT seq, role, text FROM turns WHERE session_id = ? ORDER BY seq",
    )
    .all(session.id)
    .map((row) => [
      row.seq,
      { uuid: "", role: row.role, kind: "text", ts: "", tool: null, text: row.text },
    ]);
}

/** The turns of the transcript file, numbered by position; loud when the file is gone. */
function transcriptTurns(session: SessionRow): [number, Turn][] {
  if (!existsSync(session.transcript_path)) {
    fail(
      "not-found",
      `the transcript ${session.transcript_path} is gone; only the saved text is left`,
      `run qsm-memory show ${session.id} without --full`,
    );
  }
  return fullTurns(readFileSync(session.transcript_path, "utf8")).map((turn, i) => [i + 1, turn]);
}

export function show(db: Database, prefix: string, options: ShowOptions = {}): string {
  const session = resolveSession(db, prefix);
  const [from, to] = options.lines ?? [1, Number.MAX_SAFE_INTEGER];
  const all = options.full === true ? transcriptTurns(session) : savedTurns(db, session);
  const rows = all.filter(([seq]) => seq >= from && seq <= to);
  if (rows.length === 0) {
    return `${header(session)}\nno turns in ${from}-${to === Number.MAX_SAFE_INTEGER ? "end" : to}; the session has ${all.length}`;
  }
  const window: [number, string][] = [];
  let size = 0;
  for (const [seq, turn] of rows.slice(0, SHOW_WINDOW)) {
    const line = turnLine(seq, turn);
    size += line.length;
    if (size > SHOW_CHARS && window.length > 0) {
      break;
    }
    window.push([
      seq,
      line.length > SHOW_CHARS
        ? `${line.slice(0, SHOW_CHARS)} [turn cut at ${SHOW_CHARS} of ${line.length} characters]`
        : line,
    ]);
  }
  const lines = [header(session), ...window.map(([, line]) => line)];
  const lastSeq = window.at(-1)?.[0] ?? to;
  if (rows.length > window.length) {
    lines.push(`next: --lines ${lastSeq + 1}-${lastSeq + SHOW_WINDOW}`);
  }
  return lines.join("\n");
}

export interface ListOptions {
  readonly since?: string | undefined;
  /** a project root, or any directory of it: a worktree names its main checkout */
  readonly project?: string | undefined;
  readonly now?: number | undefined;
}

export function listSessions(db: Database, options: ListOptions = {}): SessionRow[] {
  const cutoff =
    options.since === undefined ? null : sinceCutoff(options.since, options.now ?? Date.now());
  return db
    .query<SessionRow, [string | null, string | null]>(
      `SELECT * FROM sessions WHERE (?1 IS NULL OR ended_at >= ?1) AND (?2 IS NULL OR project = ?2)
       ORDER BY ended_at DESC`,
    )
    .all(cutoff, options.project === undefined ? null : projectOf(options.project));
}

export function formatList(rows: readonly SessionRow[]): string {
  if (rows.length === 0) {
    return "no sessions";
  }
  return rows
    .map(
      (row) =>
        `${row.ended_at.slice(0, 10)} ${basename(row.project)} ${row.id} ${row.turn_count} ${row.title}`,
    )
    .join("\n");
}
