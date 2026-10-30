// `show` and `list`: reading the archive. Spec: "Show reads the saved text, or the transcript
// file for the full context", "List answers what was done when".

import type { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { QsmError } from "../../../lib/qsm-error.ts";
import { projectOf } from "./project.ts";
import { sinceCutoff } from "./search.ts";
import { packedEntry } from "./store.ts";
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
    throw new QsmError("missing", `no session starts with ${prefix}`, {
      next: "run qsm-memory list",
    });
  }
  if (second !== undefined) {
    throw new QsmError("usage", `more than one session starts with ${prefix}`, {
      next: "give more of the id",
    });
  }
  return first;
}

export interface ShowOptions {
  /** read the transcript file on disk: tool calls and results too */
  readonly full?: boolean | undefined;
  /** inclusive turn window */
  readonly lines?: readonly [number, number] | undefined;
}

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

const quoted = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;

/** The restore command of a packed session: exactly the `entries` archived for it, quoted for a
 * shell. The Claude home is where the transcript lived: three levels above it. */
function restoreCommand(archive: string, transcriptPath: string, entries: readonly string[]) {
  const home = dirname(dirname(dirname(transcriptPath)));
  return `tar --zstd -xmf ${quoted(archive)} -C ${quoted(home)} ${entries.map(quoted).join(" ")}`;
}

/** The turns of the transcript file, numbered by position; loud when the file is gone. */
function transcriptTurns(db: Database, session: SessionRow): [number, Turn][] {
  if (!existsSync(session.transcript_path)) {
    const packed = packedEntry(db, session.id);
    if (packed !== null) {
      const { archive } = packed;
      const restore = restoreCommand(archive, session.transcript_path, packed.entries);
      throw new QsmError(
        "missing",
        `the transcript ${session.transcript_path} was packed into ${archive}; restore it with ${restore}`,
        { next: `run qsm-memory show ${session.id} without --full to read the saved text` },
      );
    }
    throw new QsmError(
      "missing",
      `the transcript ${session.transcript_path} is gone; only the saved text is left`,
      { next: `run qsm-memory show ${session.id} without --full` },
    );
  }
  return fullTurns(readFileSync(session.transcript_path, "utf8")).map((turn, i) => [i + 1, turn]);
}

export function show(db: Database, prefix: string, options: ShowOptions = {}): string {
  const session = resolveSession(db, prefix);
  const [from, to] = options.lines ?? [1, Number.MAX_SAFE_INTEGER];
  const all = options.full === true ? transcriptTurns(db, session) : savedTurns(db, session);
  const rows = all.filter(([seq]) => seq >= from && seq <= to);
  if (rows.length === 0) {
    return `${header(session)}\nno turns in ${from}-${to === Number.MAX_SAFE_INTEGER ? "end" : to}; the last turn is #${all.at(-1)?.[0] ?? 0}`;
  }
  const lines = [header(session)];
  let shown = 0;
  let lastSeq = from;
  let size = 0;
  for (const [seq, turn] of rows) {
    const line = turnLine(seq, turn);
    size += line.length;
    if (size > SHOW_CHARS && shown > 0) {
      break;
    }
    const cut = `${line.slice(0, SHOW_CHARS)} [turn cut at ${SHOW_CHARS} of ${line.length} characters]`;
    lines.push(line.length > SHOW_CHARS ? cut : line);
    shown += 1;
    lastSeq = seq;
  }
  if (rows.length > shown) {
    lines.push(`next: --lines ${lastSeq + 1}-${rows.at(-1)?.[0]}`);
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

export const LIST_LIMIT = 20;

/** The first `limit` items and how many more there are, so a list never lands whole in the
 * reader's context. */
export function page<T>(items: readonly T[], limit: number): { rows: T[]; more: number } {
  return { rows: items.slice(0, limit), more: Math.max(0, items.length - limit) };
}

/** The first `limit` lines, and `N more: --limit <all>` when there are others. */
export function bounded(lines: readonly string[], limit: number = LIST_LIMIT): string {
  const { rows, more } = page(lines, limit);
  return more > 0 ? [...rows, `${more} more: --limit ${lines.length}`].join("\n") : rows.join("\n");
}

export function formatList(rows: readonly SessionRow[], limit: number = LIST_LIMIT): string {
  if (rows.length === 0) {
    return "no sessions";
  }
  return bounded(
    rows.map(
      (row) =>
        `${row.ended_at.slice(0, 10)} ${basename(row.project)} ${row.id} ${row.turn_count} ${row.title}`,
    ),
    limit,
  );
}
