// The session-start block: where this project stands, in at most BLOCK_MAX characters, with no
// model call. Spec: "A session starts with one short briefing".

import type { Database } from "bun:sqlite";
import { fail, type Outcome, ok } from "../../../lib/outcome.ts";
import { type Bead, type Closed, inProgress, recentlyClosed, TrackerMissing } from "./beads.ts";
import { type Commit, commitsSince } from "./commits.ts";
import { currentNotes, fitNotes, type NoteRow } from "./notes.ts";
import { projectOf } from "./project.ts";
import type { Env } from "./store.ts";

export const BLOCK_MAX = 1500;
const SESSIONS = 3;
const BEADS = 3;
const TITLE_MAX = 50;
const PROMPT_TITLE = 60;
const SUBJECT_MAX = 60;
const CLOSED_MAX = 4;
/** Less room than this for notes and they become a count. */
const NOTES_MIN = 100;
/** What fitNotes appends when it leaves notes out: "\n99 older notes: qsm-memory notes". */
const COUNT_TAIL = 34;

const SEARCH = "Search: qsm-memory search <words>, then qsm-memory show <id>";

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

interface SessionBrief {
  readonly started_at: string;
  readonly ended_at: string;
  readonly title: string;
  readonly prompt: string | null;
  readonly prompts: number;
}

function firstLine(text: string): string {
  return text.split("\n").find((l) => l.trim().length > 0) ?? "";
}

/** The saved title, unless it is a raw command line: then the first typed prompt. */
function titleOf(s: SessionBrief): string {
  return s.title.startsWith("<") && s.prompt !== null
    ? cut(firstLine(s.prompt), PROMPT_TITLE)
    : cut(s.title, TITLE_MAX);
}

function sessionsOf(db: Database, project: string): SessionBrief[] {
  return db
    .query<SessionBrief, [string, number]>(
      `SELECT started_at, ended_at, title, (SELECT text FROM turns WHERE session_id = sessions.id
           AND role = 'user' AND text NOT LIKE '<%' ORDER BY seq LIMIT 1) AS prompt,
         (SELECT COUNT(*) FROM turns WHERE session_id = sessions.id AND role = 'user') AS prompts
       FROM sessions WHERE project = ?1 ORDER BY ended_at DESC LIMIT ?2`,
    )
    .all(project, SESSIONS);
}

/** What a session left behind: the commits and closed beads whose time falls in its window. */
function outcome(s: SessionBrief, commits: readonly Commit[], closed: readonly Closed[]): string {
  const from = Date.parse(s.started_at);
  const to = Date.parse(s.ended_at);
  const within = (at: string) => {
    const t = Date.parse(at);
    return t >= from && t <= to;
  };
  const made = commits.filter((c) => within(c.at));
  const done = closed.filter((b) => within(b.closedAt)).map((b) => b.id);
  const parts = [
    ...(made.length === 0
      ? []
      : [`${made.length} commits, last "${cut(made[0]?.subject ?? "", SUBJECT_MAX)}"`]),
    ...(done.length === 0
      ? []
      : [
          `closed ${done.slice(0, CLOSED_MAX).join(", ")}${done.length > CLOSED_MAX ? ` +${done.length - CLOSED_MAX}` : ""}`,
        ]),
  ];
  return parts.length === 0 ? "" : `: ${parts.join("; ")}`;
}

function sessionLines(
  sessions: readonly SessionBrief[],
  cwd: string,
  env: Env | undefined,
): string[] {
  const oldest = sessions.at(-1)?.started_at;
  if (oldest === undefined) {
    return [];
  }
  const commits = commitsSince(cwd, oldest);
  const closed = recentlyClosed(cwd, env);
  return sessions.map(
    (s) =>
      `- ${s.ended_at.slice(0, 10)} ${titleOf(s)} (${s.prompts} user turns)${outcome(s, commits, closed)}`,
  );
}

function beadLine(bead: Bead): string {
  const epic =
    bead.epic === null ? "" : ` (epic ${bead.epic.id} ${cut(bead.epic.title, TITLE_MAX)})`;
  return `- ${bead.id} ${cut(bead.title, TITLE_MAX)}${epic}`;
}

function noteLines(notes: readonly NoteRow[], room: number): string[] {
  if (notes.length === 0) {
    return [];
  }
  return room >= NOTES_MIN
    ? ["Notes:", fitNotes(notes, room - COUNT_TAIL)]
    : [`${notes.length} notes: qsm-memory notes`];
}

export interface OrientOptions {
  readonly env?: Env;
  readonly now?: number;
}

export function orient(db: Database, cwd: string, options: OrientOptions = {}): string {
  const project = projectOf(cwd);
  const sessions = sessionLines(sessionsOf(db, project), cwd, options.env);
  const beads = inProgress(cwd, BEADS, options.env);
  const head = [
    ...(sessions.length === 0 ? [] : ["Last sessions here:", ...sessions]),
    ...(beads.length === 0 ? [] : ["In progress:", ...beads.map(beadLine)]),
  ];
  const notes = currentNotes(db, project, { now: options.now });
  const fixed = [...head, SEARCH].join("\n").length;
  const room = BLOCK_MAX - fixed - "\nNotes:\n".length;
  return cut([...head, ...noteLines(notes, room), SEARCH].join("\n"), BLOCK_MAX);
}

/** The verb's answer: the block, or `missing` when a tracker's task tool is not installed, or
 * `failed` with the reason. */
export function orientOutcome(
  db: Database,
  cwd: string,
  options: { readonly env?: Env } = {},
): Outcome<{ text: string }> {
  try {
    const text = orient(db, cwd, options);
    return ok({ text }, text);
  } catch (error) {
    const reason = (error as Error).message;
    return error instanceof TrackerMissing ? fail("missing", reason) : fail("failed", reason);
  }
}
