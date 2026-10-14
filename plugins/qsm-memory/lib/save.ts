// `save`: one transcript into the archive, idempotent by turn uuid, so a session that `--resume`
// appended to gains only its new turns.

import type { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import { basename, dirname, join } from "node:path";
import { fail } from "./errors.ts";
import { projectOf } from "./project.ts";
import { parseTranscript, sessionIdOf, type Turn } from "./transcript.ts";

export type SaveResult =
  | {
      readonly status: "saved";
      readonly id: string;
      readonly turns: number;
      readonly added: number;
    }
  | { readonly status: "skipped"; readonly path: string; readonly reason: string };

export interface SaveOptions {
  /** the working directory when the transcript names none */
  readonly cwd?: string;
  readonly now?: () => string;
}

interface SessionRow {
  readonly id: string;
  readonly saved_at: string;
}

const INSERT_TURN = `INSERT OR IGNORE INTO turns
  (session_id, seq, uuid, role, ts, text)
  VALUES (?, ?, ?, ?, ?, ?)`;

function insertTurns(db: Database, sessionId: string, turns: readonly Turn[]): number {
  const existing = db
    .query<{ seq: number }, [string]>("SELECT MAX(seq) AS seq FROM turns WHERE session_id = ?")
    .get(sessionId);
  let seq = existing?.seq ?? 0;
  let added = 0;
  const stmt = db.query(INSERT_TURN);
  for (const turn of turns) {
    const r = stmt.run(sessionId, seq + 1, turn.uuid, turn.role, turn.ts, turn.text);
    if (r.changes > 0) {
      seq += 1;
      added += 1;
    }
  }
  return added;
}

const UPSERT_SESSION = `INSERT INTO sessions
  (id, cwd, project, title, started_at, ended_at, transcript_path, saved_at, turn_count)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title, ended_at = excluded.ended_at, saved_at = excluded.saved_at,
    turn_count = excluded.turn_count, transcript_path = excluded.transcript_path`;

/** Saves `transcriptPath`. A subagent transcript, or one in which nobody typed a prompt,
 * writes nothing and says why. */
export function saveTranscript(
  db: Database,
  transcriptPath: string,
  options: SaveOptions = {},
): SaveResult {
  if (!existsSync(transcriptPath)) {
    fail("not-found", `no transcript at ${transcriptPath}`, "check the path");
  }
  if (basename(dirname(transcriptPath)) === "subagents") {
    return { status: "skipped", path: transcriptPath, reason: "subagent transcript" };
  }
  const transcript = parseTranscript(readFileSync(transcriptPath, "utf8"));
  const id = sessionIdOf(transcriptPath);
  if (transcript.humanTurns === 0) {
    // Remembered, so catch-up does not parse the same file every start.
    db.query("INSERT OR REPLACE INTO skipped (id, path, mtime, reason) VALUES (?, ?, ?, ?)").run(
      id,
      transcriptPath,
      statSync(transcriptPath).mtimeMs,
      "no human turn",
    );
    return { status: "skipped", path: transcriptPath, reason: "no human turn" };
  }
  const { turns, title } = transcript;
  const cwd = transcript.cwd ?? options.cwd ?? process.cwd();
  const [first] = turns;
  const last = turns.at(-1);
  const now = (options.now ?? (() => new Date().toISOString()))();
  // immediate: it reads before it writes, and a deferred read that meets another writer's commit
  // fails at once with "database is locked", past the busy timeout.
  const [added, total] = db
    .transaction((): [number, number] => {
      const count = insertTurns(db, id, turns);
      const stored =
        db
          .query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM turns WHERE session_id = ?")
          .get(id)?.n ?? 0;
      db.query(UPSERT_SESSION).run(
        id,
        cwd,
        projectOf(cwd),
        title ?? id,
        first?.ts ?? now,
        last?.ts ?? now,
        transcriptPath,
        now,
        stored,
      );
      return [count, stored];
    })
    .immediate();
  return { status: "saved", id, turns: total, added };
}

/** Claude Code's transcript directory. */
export function projectsDir(env: Readonly<Record<string, string | undefined>>): string {
  const home = env.CLAUDE_CONFIG_DIR ?? join(env.HOME ?? os.homedir(), ".claude");
  return join(home, "projects");
}

function listJsonl(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => join(dir, name));
}

/** Every main transcript under `projects`. */
export function listTranscripts(projects: string): string[] {
  if (!existsSync(projects)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of readdirSync(projects, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const dir = join(projects, entry.name);
    out.push(...listJsonl(dir));
  }
  return out;
}

/** Transcripts the archive lacks, or whose file is newer than its saved-at
 * (or than the skip that judged it empty), oldest first. */
export function unsavedTranscripts(db: Database, projects: string): string[] {
  const rows = db.query<SessionRow, []>("SELECT id, saved_at FROM sessions").all();
  const seen = new Map(rows.map((row) => [row.id, Date.parse(row.saved_at)]));
  for (const row of db
    .query<{ id: string; mtime: number }, []>("SELECT id, mtime FROM skipped")
    .all()) {
    seen.set(row.id, row.mtime);
  }
  return listTranscripts(projects)
    .filter((path) => {
      const seenAt = seen.get(sessionIdOf(path));
      return seenAt === undefined || statSync(path).mtimeMs > seenAt;
    })
    .toSorted((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
}

export interface CatchUpResult {
  readonly saved: number;
  readonly skipped: number;
  readonly remain: number;
}

const CATCH_UP_MAX = 20;

/** Saves at most `max` unsaved transcripts and says how many remain. */
export function catchUp(db: Database, projects: string, max = CATCH_UP_MAX): CatchUpResult {
  const pending = unsavedTranscripts(db, projects);
  const batch = pending.slice(0, max);
  let saved = 0;
  let skipped = 0;
  for (const path of batch) {
    const r = saveTranscript(db, path);
    if (r.status === "saved") {
      saved += 1;
    } else {
      skipped += 1;
    }
  }
  return { saved, skipped, remain: pending.length - batch.length };
}
