// `pack`: the transcripts nobody uses any more move into one zstd archive beside the database.
// Age is counted in days of use, so a break never ages a transcript. Spec: "Pack moves transcripts
// nobody uses into a monthly archive, counted in days of use".

import type { Database } from "bun:sqlite";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { isAlive } from "../../../lib/detach.ts";
import { isRecord, messageOf, type Outcome, ok, onPath } from "../../../lib/outcome.ts";
import { claudeDir } from "../../../lib/paths.ts";
import { QsmError } from "../../../lib/qsm-error.ts";
import { listTranscripts, mtimeOf, projectsDir, unsavedTranscripts } from "./save.ts";
import { type Env, getState, resolveDbPath, setState } from "./store.ts";
import { sessionIdOf } from "./transcript.ts";

/** Days of use a transcript may be unused before it is idle. */
export const IDLE_DAYS = 7;
/** Days after activation, and after the last pack, before a pack runs. */
export const GRACE_DAYS = 30;
const DAY_MS = 86_400_000;

/** The local calendar date, `YYYY-MM-DD`, of a moment. */
export function localDate(at: Date | number | string): string {
  const d = new Date(at);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** The days of use: each local date a session started on, and today. Sorted, once each. */
export function daysOfUse(startedAts: readonly string[], now: Date): string[] {
  return [...new Set([...startedAts.map(localDate), localDate(now)])].toSorted();
}

/** The days of use after the local date of `mtimeMs`: the age of a transcript. */
export function ageOf(mtimeMs: number, days: readonly string[]): number {
  const changed = localDate(mtimeMs);
  return days.filter((day) => day > changed).length;
}

export interface PackState {
  readonly retention: string | null;
  readonly activatedAt: string | null;
  readonly lastPackAt: string | null;
}

/** Why no pack is due now, naming the first unmet condition, or null when one is. */
export function notDueBecause(state: PackState, now: Date): string | null {
  if (state.retention !== "qsm") {
    return state.retention === null
      ? "no retention choice is recorded; the pack runs under --memory qsm"
      : `the recorded retention choice is ${state.retention}; the pack runs under qsm`;
  }
  const waits = (since: string, what: string): string | null => {
    const until = Date.parse(since) + GRACE_DAYS * DAY_MS;
    return now.getTime() < until
      ? `${what} ${localDate(since)}; the next pack is ${localDate(until)}`
      : null;
  };
  if (state.activatedAt === null) {
    return "no activation date is recorded; run qsm-setup activate qsm-memory -- --memory qsm";
  }
  const grace = waits(state.activatedAt, `within ${GRACE_DAYS} days of activation on`);
  if (grace !== null) {
    return grace;
  }
  return state.lastPackAt === null ? null : waits(state.lastPackAt, `the last pack was on`);
}

interface Taken {
  readonly id: string;
  readonly jsonl: string;
  /** relative to the Claude home, as tar is given them */
  readonly entries: string[];
  /** what `tar -tf` must list for them: a directory with a trailing slash */
  readonly expected: string[];
  /** size and mtime of every file, to see that none changed while packing */
  readonly signature: string;
  readonly bytes: number;
}

function takeSession(home: string, jsonl: string): Taken {
  const id = sessionIdOf(jsonl);
  const dir = join(dirname(jsonl), id);
  const entries = [relative(home, jsonl)];
  const expected = [...entries];
  const files = [jsonl];
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    entries.push(relative(home, dir));
    expected.push(`${relative(home, dir)}/`);
    for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
      const path = join(entry.parentPath, entry.name);
      const rel = relative(home, path);
      expected.push(entry.isDirectory() ? `${rel}/` : rel);
      if (!entry.isDirectory()) {
        files.push(path);
      }
    }
  }
  const stats = files.map((file) => lstatSync(file));
  return {
    id,
    jsonl,
    entries,
    expected,
    signature: stats.map((s) => `${s.size}:${s.mtimeMs}`).join(","),
    bytes: stats.reduce((sum, s) => sum + s.size, 0),
  };
}

/** The ids of the sessions running now: those a `sessions/<pid>.json` names whose pid is alive.
 * An unreadable file fails the run, because moving a live transcript is the one unsafe outcome. */
function liveSessionIds(home: string): Set<string> {
  const dir = join(home, "sessions");
  const live = new Set<string>();
  if (!existsSync(dir)) {
    return live;
  }
  for (const name of readdirSync(dir).filter((n) => /^\d+\.json$/.test(n))) {
    const path = join(dir, name);
    let record: unknown;
    try {
      record = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      throw new QsmError("failed", `${path} cannot be read: ${messageOf(error)}`, {
        next: "nothing was moved; fix or remove that file",
      });
    }
    if (
      !isRecord(record) ||
      typeof record.pid !== "number" ||
      typeof record.sessionId !== "string"
    ) {
      throw new QsmError("failed", `${path} names no pid and sessionId`, {
        next: "nothing was moved; the shape of Claude Code's sessions/ files changed",
      });
    }
    if (isAlive(record.pid)) {
      live.add(record.sessionId);
    }
  }
  return live;
}

function requireTools(env: Env): void {
  for (const tool of ["tar", "zstd"]) {
    if (!onPath(tool, env)) {
      throw new QsmError("missing", `${tool} is not on PATH, so nothing was packed`, {
        next: `install ${tool}`,
      });
    }
  }
}

function runTool(cmd: string, args: readonly string[], env: Env): string {
  const r = Bun.spawnSync([cmd, ...args], { env, stdout: "pipe", stderr: "pipe" });
  if (!r.success) {
    throw new QsmError("failed", `${cmd} ${args[0] ?? ""} failed: ${r.stderr.toString().trim()}`);
  }
  return r.stdout.toString();
}

/** `tar -cf - | zstd -19 -T0` into `part`; throws with the stderr of whichever failed. */
async function writeArchive(home: string, entries: readonly string[], part: string, env: Env) {
  const tar = Bun.spawn(["tar", "-C", home, "-cf", "-", "--", ...entries], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const zstd = Bun.spawn(["zstd", "-19", "-T0", "-q", "-f", "-o", part], {
    env,
    stdin: tar.stdout,
    stderr: "pipe",
  });
  const [tarCode, zstdCode, tarErr, zstdErr] = await Promise.all([
    tar.exited,
    zstd.exited,
    new Response(tar.stderr).text(),
    new Response(zstd.stderr).text(),
  ]);
  if (tarCode !== 0 || zstdCode !== 0) {
    throw new QsmError("failed", `writing ${part} failed: ${(tarErr + zstdErr).trim()}`);
  }
  chmodSync(part, 0o600);
}

/** The archive of `taken` at `target`, written as `.part`, tested, compared to the files taken, and
 * renamed. Throws before the rename, so a failure leaves nothing but the `.part` removed here. */
async function archiveSessions(
  home: string,
  taken: readonly Taken[],
  target: string,
  env: Env,
): Promise<void> {
  const part = `${target}.part`;
  try {
    await writeArchive(
      home,
      taken.flatMap((t) => t.entries),
      part,
      env,
    );
    runTool("zstd", ["-t", "-q", part], env);
    const listed = new Set(
      runTool("tar", ["--zstd", "-tf", part], env).split("\n").filter(Boolean),
    );
    const want = new Set(taken.flatMap((t) => t.expected));
    if (listed.size !== want.size || !want.isSubsetOf(listed)) {
      throw new QsmError(
        "failed",
        `${part} does not list the files taken (${listed.size} of ${want.size})`,
      );
    }
    renameSync(part, target);
  } finally {
    rmSync(part, { force: true });
  }
}

/** The idle, saved, not-running transcripts under the Claude home. */
function idleTranscripts(db: Database, env: Env, now: Date): string[] {
  const projects = projectsDir(env);
  const unsaved = new Set(unsavedTranscripts(db, projects));
  const live = liveSessionIds(claudeDir(env));
  const days = daysOfUse(
    db
      .query<{ started_at: string }, []>("SELECT started_at FROM sessions")
      .all()
      .map((r) => r.started_at),
    now,
  );
  return listTranscripts(projects)
    .filter((path) => !unsaved.has(path) && !live.has(sessionIdOf(path)))
    .filter((path) => {
      const mtime = mtimeOf(path);
      return mtime !== null && ageOf(mtime, days) >= IDLE_DAYS;
    })
    .toSorted();
}

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

/** One pack: nothing when none is due, else the idle transcripts into `transcripts/<today>.tar.zst`,
 * their originals removed once the archive is tested and listed. */
export async function pack(
  db: Database,
  env: Env,
  now: Date = new Date(),
  /** a test's seam: runs after the archive is renamed, before any original is removed */
  afterArchive: () => void = () => {},
): Promise<Outcome> {
  const claimed = db
    .transaction(() => {
      const state: PackState = {
        retention: getState(db, "retention"),
        activatedAt: getState(db, "activated_at"),
        lastPackAt: getState(db, "last_pack_at"),
      };
      const reason = notDueBecause(state, now);
      if (reason === null) {
        setState(db, "last_pack_at", now.toISOString());
      }
      return { reason, previous: state.lastPackAt };
    })
    .immediate();
  if (claimed.reason !== null) {
    return ok({ packed: 0 }, `no pack is due: ${claimed.reason}`);
  }
  const home = claudeDir(env);
  const archiveDir = join(dirname(resolveDbPath(env)), "transcripts");
  const target = join(archiveDir, `${localDate(now)}.tar.zst`);
  let taken: Taken[];
  try {
    requireTools(env);
    taken = idleTranscripts(db, env, now).map((jsonl) => takeSession(home, jsonl));
    if (taken.length === 0) {
      setState(db, "last_pack_at", claimed.previous);
      return ok({ packed: 0 }, "nothing is idle yet; nothing was moved");
    }
    if (existsSync(target)) {
      throw new QsmError("failed", `${target} exists already; nothing was moved`);
    }
    mkdirSync(archiveDir, { recursive: true, mode: 0o700 });
    await archiveSessions(home, taken, target, env);
  } catch (error) {
    setState(db, "last_pack_at", claimed.previous);
    throw error;
  }
  afterArchive();
  return removeOriginals(db, home, taken, target, now);
}

/** After the archive is renamed: remove each session's originals unless a file changed since it was
 * listed or the session became live, and record it as packed the moment its transcript is gone, so
 * a later failure still lets `show --full` name the archive. A session left in place is named. */
function removeOriginals(
  db: Database,
  home: string,
  taken: readonly Taken[],
  target: string,
  now: Date,
): Outcome {
  const warnings: string[] = [];
  // The archive is renamed already: sessions/ that cannot be read keeps every original.
  let live: Set<string>;
  try {
    live = liveSessionIds(home);
  } catch (error) {
    warnings.push(`${messageOf(error)}; every original left in place`);
    live = new Set(taken.map((t) => t.id));
  }
  const record = db.query(
    "INSERT OR REPLACE INTO packed (session_id, archive, packed_at, entries) VALUES (?, ?, ?, ?)",
  );
  const moved: Taken[] = [];
  for (const t of taken) {
    try {
      if (live.has(t.id)) {
        warnings.push(`${t.jsonl} became live while packing; left in place`);
        continue;
      }
      if (takeSession(home, t.jsonl).signature !== t.signature) {
        warnings.push(`${t.jsonl} changed while packing; left in place`);
        continue;
      }
      rmSync(t.jsonl);
      record.run(t.id, target, now.toISOString(), JSON.stringify(t.entries));
      moved.push(t);
      rmSync(join(dirname(t.jsonl), t.id), { recursive: true, force: true });
    } catch (error) {
      warnings.push(`${t.jsonl} was not fully removed: ${messageOf(error)}`);
    }
  }
  const before = moved.reduce((sum, t) => sum + t.bytes, 0);
  const after = statSync(target).size;
  const data = { packed: moved.length, before, after, archive: target };
  const message = `packed ${moved.length} sessions, ${mb(before)} into ${mb(after)}: ${target}`;
  return warnings.length === 0 ? ok(data, message) : { code: "partial", message, data, warnings };
}
