// One SQLite database per machine: the archive of sessions and the short-term notes.

import { Database } from "bun:sqlite";
import { chmodSync, existsSync, linkSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { dataDir } from "../../../lib/paths.ts";
import { QsmError } from "../../../lib/qsm-error.ts";
import { typedText } from "./transcript.ts";

export type Env = Readonly<Record<string, string | undefined>>;

/** `QSM_MEMORY_DB`, else `qsm-memory/memory.db` in the data home. */
export function resolveDbPath(env: Env): string {
  const override = env.QSM_MEMORY_DB;
  if (override !== undefined && override.length > 0) {
    return override;
  }
  return join(dataDir(env), "qsm-memory", "memory.db");
}

// A turn is what a person or the model said, as text. The full context, tool calls and results
// included, is the transcript file at sessions.transcript_path.
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  cwd TEXT NOT NULL,
  project TEXT NOT NULL,
  title TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  transcript_path TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  turn_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS turns (
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  uuid TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  ts TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (session_id, seq),
  UNIQUE (session_id, uuid)
);

CREATE VIRTUAL TABLE IF NOT EXISTS turns_fts USING fts5(
  text,
  content='turns',
  content_rowid='rowid',
  tokenize='porter unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS turns_ai AFTER INSERT ON turns BEGIN
  INSERT INTO turns_fts(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TRIGGER IF NOT EXISTS turns_ad AFTER DELETE ON turns BEGIN
  INSERT INTO turns_fts(turns_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;

-- An image a person pasted into a turn: the bytes are the blob, kept after Claude Code deletes
-- the transcript. turn_uuid is the image block's key; an image-only prompt has no turn row.
CREATE TABLE IF NOT EXISTS blob_ref (
  session_id TEXT NOT NULL,
  turn_uuid TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  media_type TEXT NOT NULL,
  PRIMARY KEY (session_id, turn_uuid)
);

CREATE TABLE IF NOT EXISTS skipped (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  mtime REAL NOT NULL,
  reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  project TEXT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT
);

-- retention, activated_at and last_pack_at: what the person chose and when the pack last ran.
CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- A session whose transcript moved into an archive under transcripts/.
CREATE TABLE IF NOT EXISTS packed (
  session_id TEXT PRIMARY KEY,
  archive TEXT NOT NULL,
  packed_at TEXT NOT NULL,
  -- the top-level entries archived for the session, as a JSON array of paths in the Claude home
  entries TEXT NOT NULL
);
`;

/** User turns that are no person's words (slash-command wrappers, task notifications, compaction
 * summaries, bash output, interrupt markers) were stored before the rule knew them. Delete them,
 * then the sessions left with no user turn, renumber nothing (a gap in `seq` is harmless), fix the
 * turn counts and VACUUM. Cheap to repeat: a second run finds nothing and skips the VACUUM. */
function purgeHarnessTurns(db: Database): void {
  const candidates = db
    .query<{ session_id: string; seq: number; text: string }, []>(
      `SELECT session_id, seq, text FROM turns WHERE role = 'user'
       AND (text LIKE '<%' OR text LIKE 'This session is being continued%' OR text LIKE '[Request interrupted%')`,
    )
    .all()
    .filter((turn) => typedText(turn.text).length === 0);
  if (candidates.length === 0) {
    return;
  }
  const drop = db.query("DELETE FROM turns WHERE session_id = ? AND seq = ?");
  const touched = [...new Set(candidates.map((c) => c.session_id))];
  db.transaction(() => {
    for (const { session_id: id, seq } of candidates) {
      drop.run(id, seq);
    }
    db.run(
      `DELETE FROM sessions WHERE id IN (${touched.map(() => "?").join(",")})
       AND NOT EXISTS (SELECT 1 FROM turns WHERE session_id = sessions.id AND role = 'user')`,
      touched,
    );
    db.run(
      "UPDATE sessions SET turn_count = (SELECT COUNT(*) FROM turns WHERE session_id = sessions.id)",
    );
    db.run("DELETE FROM turns WHERE session_id NOT IN (SELECT id FROM sessions)");
  })();
  db.run("VACUUM");
}

/** Applies the schema; idempotent, and usable on `new Database(":memory:")`. */
export function applySchema(db: Database): void {
  db.run(SCHEMA_SQL);
  purgeHarnessTurns(db);
  // A skip written before the session gained its first typed prompt; save deletes it now.
  db.run("DELETE FROM skipped WHERE id IN (SELECT id FROM sessions)");
}

/** Opens (creating if absent) the database at `path`: owner-only file and
 * directory, WAL, a busy timeout so two hooks ending together both write. */
export function openDb(path: string): Database {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (!existsSync(path)) {
    createDb(path);
  }
  const db = new Database(path);
  db.run("PRAGMA busy_timeout = 5000");
  applySchema(db);
  return db;
}

/** Builds a new database beside `path` and links it into place. `PRAGMA journal_mode = WAL` on a
 * file another process is opening fails at once with "database is locked", past the busy timeout;
 * a private file has no other opener, WAL stays in its header, and a link that loses the race to
 * another creator leaves the winner's file. */
function createDb(path: string): void {
  const aside = `${path}.${process.pid}.new`;
  try {
    const db = new Database(aside);
    db.run("PRAGMA journal_mode = WAL");
    applySchema(db);
    db.close();
    chmodSync(aside, 0o600);
    linkSync(aside, path);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
      throw error;
    }
  } finally {
    for (const file of [aside, `${aside}-wal`, `${aside}-shm`]) {
      rmSync(file, { force: true });
    }
  }
}

/** One recorded value (`retention`, `activated_at`, `last_pack_at`), or null when never set. */
export function getState(db: Database, key: string): string | null {
  return (
    db.query<{ value: string }, [string]>("SELECT value FROM state WHERE key = ?").get(key)
      ?.value ?? null
  );
}

/** Records `value` under `key`; null forgets the key. */
export function setState(db: Database, key: string, value: string | null): void {
  if (value === null) {
    db.query("DELETE FROM state WHERE key = ?").run(key);
    return;
  }
  db.query("INSERT OR REPLACE INTO state (key, value) VALUES (?, ?)").run(key, value);
}

/** The archive a session was packed into and the entries archived for it, or null when it was not
 * packed. */
export function packedEntry(
  db: Database,
  sessionId: string,
): { archive: string; entries: string[] } | null {
  const row = db
    .query<{ archive: string; entries: string }, [string]>(
      "SELECT archive, entries FROM packed WHERE session_id = ?",
    )
    .get(sessionId);
  if (row === null) {
    return null;
  }
  const entries: unknown = JSON.parse(row.entries);
  if (!Array.isArray(entries) || !entries.every((e) => typeof e === "string")) {
    throw new QsmError("failed", `the packed entries of ${sessionId} are not a list of paths`, {
      next: "the archive was written by something else; look at the packed table",
    });
  }
  return { archive: row.archive, entries };
}

/** The archive for this environment. */
export function openArchive(env: Env): Database {
  return openDb(resolveDbPath(env));
}
