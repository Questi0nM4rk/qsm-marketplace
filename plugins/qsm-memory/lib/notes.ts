// Short-term notes: the one thing an agent writes.

import type { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import { basename } from "node:path";
import { looksLikeSecret } from "../../../lib/secret-shapes.ts";
import { QsmError } from "../../../lib/qsm-error.ts";

export interface NoteRow {
  readonly id: string;
  readonly project: string | null;
  readonly text: string;
  readonly created_at: string;
  readonly expires_at: string | null;
}

export const NOTE_DEFAULT_DAYS = 14;
const DAY_MS = 86_400_000;

export interface AddNoteInput {
  readonly text: string;
  /** null for a note every project sees */
  readonly project: string | null;
  /** days until expiry; null keeps the note until dropped */
  readonly expiresDays: number | null;
  readonly now?: number;
}

export function addNote(db: Database, input: AddNoteInput): NoteRow {
  const shape = looksLikeSecret(input.text);
  if (shape !== null) {
    throw new QsmError("blocked", `text matches a secret shape (${shape})`, {
      next: "remove the secret and try again",
    });
  }
  if (input.text.trim().length === 0) {
    throw new QsmError("usage", "a note needs text", { next: "pass the note text" });
  }
  const now = input.now ?? Date.now();
  const row: NoteRow = {
    id: randomBytes(4).toString("hex"),
    project: input.project,
    text: input.text.trim(),
    created_at: new Date(now).toISOString(),
    expires_at:
      input.expiresDays === null ? null : new Date(now + input.expiresDays * DAY_MS).toISOString(),
  };
  db.query(
    "INSERT INTO notes (id, project, text, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
  ).run(row.id, row.project, row.text, row.created_at, row.expires_at);
  return row;
}

function purgeExpired(db: Database, now: number): void {
  db.query("DELETE FROM notes WHERE expires_at IS NOT NULL AND expires_at < ?").run(
    new Date(now).toISOString(),
  );
}

/** The project's current notes and the global ones, newest first; `all`
 * ignores the project. Expired rows are gone after this call. */
export function currentNotes(
  db: Database,
  project: string | null,
  options: { readonly all?: boolean | undefined; readonly now?: number | undefined } = {},
): NoteRow[] {
  purgeExpired(db, options.now ?? Date.now());
  if (options.all === true) {
    return db.query<NoteRow, []>("SELECT * FROM notes ORDER BY created_at DESC, rowid DESC").all();
  }
  return db
    .query<NoteRow, [string | null]>(
      "SELECT * FROM notes WHERE project IS NULL OR project = ?1 ORDER BY created_at DESC, rowid DESC",
    )
    .all(project);
}

export function dropNote(db: Database, id: string): void {
  const r = db.query("DELETE FROM notes WHERE id = ?").run(id);
  if (r.changes === 0) {
    throw new QsmError("missing", `no note ${id}`, { next: "run qsm-memory notes" });
  }
}

export function formatNotes(rows: readonly NoteRow[], withProject = false): string {
  if (rows.length === 0) {
    return "no notes";
  }
  return rows
    .map((row) => {
      const until = row.expires_at === null ? "kept" : row.expires_at.slice(0, 10);
      const where = withProject
        ? ` [${row.project === null ? "global" : basename(row.project)}]`
        : "";
      return `${row.id} from ${row.created_at.slice(0, 10)} until ${until}${where}: ${row.text}`;
    })
    .join("\n");
}

/** The newest notes that fit `budget` characters (about 4 per token), then
 * the count of the rest; the first note is cut rather than dropped. */
export function fitNotes(rows: readonly NoteRow[], budget: number): string {
  const lines = formatNotes(rows).split("\n");
  if (rows.length === 0) {
    return lines[0] ?? "";
  }
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (kept.length > 0 && used + line.length + 1 > budget) {
      break;
    }
    kept.push(kept.length === 0 ? line.slice(0, budget) : line);
    used += line.length + 1;
  }
  const rest = lines.length - kept.length;
  return rest === 0 ? kept.join("\n") : `${kept.join("\n")}\n${rest} older notes: qsm-memory notes`;
}
