#!/usr/bin/env bun

// qsm-memory: the per-machine archive of Claude Code sessions and the short-term notes.

import type { Database } from "bun:sqlite";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type Handler, runCli } from "../../../lib/cli-base.ts";
import { serveStdio } from "../../../lib/mcp-stdio.ts";
import { fail, type Outcome, type OutcomeCode, ok } from "../../../lib/outcome.ts";
import type { QsmManifest } from "../../../lib/qsm-manifest.ts";
import { startDetached } from "../lib/detach.ts";
import { type ErrorCode, MemError } from "../lib/errors.ts";
import { buildServer, parseLines } from "../lib/mcp.ts";
import { addNote, currentNotes, dropNote, formatNotes, NOTE_DEFAULT_DAYS } from "../lib/notes.ts";
import { orientOutcome } from "../lib/orient.ts";
import { projectOf } from "../lib/project.ts";
import { catchUp, projectsDir, saveTranscript, unsavedTranscripts } from "../lib/save.ts";
import { formatHits, search } from "../lib/search.ts";
import { bounded, formatList, LIST_LIMIT, listSessions, page, show } from "../lib/sessions.ts";
import { openArchive, resolveDbPath } from "../lib/store.ts";
// A static import: bun's compiler inlines JSON imports into the binary, so
// `--help` works with no checkout in the room (AGENTS.md law 9).
import manifestJson from "../qsm.json" with { type: "json" };

const manifest = manifestJson as QsmManifest;

const OUTCOME_OF: Readonly<Record<ErrorCode, Exclude<OutcomeCode, "ok">>> = {
  "not-found": "missing",
  ambiguous: "usage",
  usage: "usage",
  secret: "blocked",
};

function memOutcome(error: MemError): Outcome {
  const outcome = fail(OUTCOME_OF[error.code], `${error.code}: ${error.message}`, {
    code: error.code,
    next: error.next,
  });
  return { ...outcome, warnings: [`next: ${error.next}`] };
}

/** Every verb's handler wrapped once: a MemError comes back as its own
 * outcome instead of a stack trace. */
function guarded(handlers: Readonly<Record<string, Handler>>): Record<string, Handler> {
  return Object.fromEntries(
    Object.entries(handlers).map(([verb, handler]) => [
      verb,
      async (call) => {
        try {
          return await handler(call);
        } catch (error) {
          if (error instanceof MemError) {
            return memOutcome(error);
          }
          throw error;
        }
      },
    ]),
  );
}

const env = () => process.env;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" ? v : undefined);

/** The same save in a detached qsm-memory process, its outcome appended to the save log. */
function saveDetached(transcript: string | undefined, catchUpAll: boolean, cwd?: string): Outcome {
  const started = startDetached(
    [
      "save",
      ...(transcript === undefined ? [] : [transcript]),
      ...(catchUpAll ? ["--catch-up"] : []),
      ...(cwd === undefined ? [] : ["--cwd", cwd]),
      "--log",
    ],
    env(),
  );
  return started.started
    ? ok(started, `started the save in the background; its outcome goes to ${started.log}`)
    : fail("missing", started.reason);
}

const runSave: Handler = (call) => {
  const transcript = str(call.args.transcript);
  const catchUpAll = call.args.catchUp === true;
  const cwd = str(call.args.cwd);
  if (transcript === undefined && !catchUpAll) {
    return fail("usage", "save needs a transcript path or --catch-up");
  }
  if (call.args.detach === true) {
    return saveDetached(transcript, catchUpAll, cwd);
  }
  const db = openArchive(env());
  if (catchUpAll) {
    const r = catchUp(db, projectsDir(env()));
    const skipped = r.skipped === 0 ? "" : `, ${r.skipped} skipped`;
    const failed = r.failed.length === 0 ? "" : `, ${r.failed.length} failed`;
    const message = `saved ${r.saved}${skipped}${failed}, ${r.remain} remain`;
    return r.failed.length === 0
      ? ok(r, message)
      : { code: "partial", message, data: r, warnings: r.failed };
  }
  const r = saveTranscript(db, transcript as string, cwd === undefined ? {} : { cwd });
  return r.status === "saved"
    ? ok(r, `saved ${r.id}: ${r.turns} turns, ${r.added} new`)
    : ok(r, `skipped: ${r.reason} in ${r.path}`);
};

const runSearch: Handler = (call) => {
  const limit = num(call.args.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    return fail("usage", `--limit must be a positive whole number (got '${limit}')`);
  }
  const hits = search(openArchive(env()), call.args.query as string, {
    ...(limit === undefined ? {} : { limit }),
    ...(str(call.args.since) === undefined ? {} : { since: str(call.args.since) as string }),
    ...(str(call.args.project) === undefined ? {} : { project: str(call.args.project) as string }),
  });
  return ok(hits, formatHits(hits));
};

const runShow: Handler = (call) => {
  const spec = str(call.args.lines);
  if (spec !== undefined && !/^\d+-\d+$/.test(spec)) {
    return fail("usage", `--lines takes a-b (got '${spec}')`);
  }
  const text = show(openArchive(env()), call.args.session as string, {
    full: call.args.full === true,
    ...(spec === undefined ? {} : { lines: parseLines(spec) }),
  });
  return ok({ text }, text);
};

const runList: Handler = (call) => {
  const limit = num(call.args.limit) ?? LIST_LIMIT;
  if (!Number.isInteger(limit) || limit <= 0) {
    return fail("usage", `--limit must be a positive whole number (got '${limit}')`);
  }
  const db = openArchive(env());
  if (call.args.unsaved === true) {
    const paths = unsavedTranscripts(db, projectsDir(env()));
    return ok(
      page(paths, limit),
      paths.length === 0 ? "nothing unsaved" : bounded(paths, limit),
    );
  }
  const rows = listSessions(db, {
    ...(str(call.args.since) === undefined ? {} : { since: str(call.args.since) as string }),
    ...(str(call.args.project) === undefined ? {} : { project: str(call.args.project) as string }),
  });
  return ok(
    page(rows, limit),
    formatList(rows, limit),
  );
};

const runNote: Handler = (call) => {
  const db = openArchive(env());
  const drop = str(call.args.drop);
  if (drop !== undefined) {
    dropNote(db, drop);
    return ok({ dropped: drop }, `dropped ${drop}`);
  }
  const expires = num(call.args.expires);
  if (expires !== undefined && expires <= 0) {
    return fail("usage", `--expires must be a positive number of days (got '${expires}')`);
  }
  const row = addNote(db, {
    text: str(call.args.text) ?? "",
    project: call.args.global === true ? null : projectOf(process.cwd()),
    expiresDays: call.args.keep === true ? null : (expires ?? NOTE_DEFAULT_DAYS),
  });
  return ok(row, `noted ${row.id}`);
};

const runNotes: Handler = (call) => {
  const all = call.args.all === true;
  const rows = currentNotes(openArchive(env()), projectOf(process.cwd()), { all });
  return ok(rows, formatNotes(rows, all));
};

/** The session-start block; the hook shows its text to the model. */
const runOrient: Handler = (call) =>
  orientOutcome(openArchive(env()), str(call.args.cwd) ?? process.cwd(), { env: env() });

const count = (db: Database, table: string) =>
  db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? 0;

/** The health probe qsm-setup runs: the archive opens, or the reason it does not. */
const runDoctor: Handler = () => {
  const path = resolveDbPath(env());
  try {
    const db = openArchive(env());
    const r = {
      path,
      sessions: count(db, "sessions"),
      notes: count(db, "notes"),
      unsaved: unsavedTranscripts(db, projectsDir(env())).length,
    };
    const tail =
      r.unsaved === 0
        ? "nothing unsaved"
        : `${r.unsaved} unsaved, the next session start saves them`;
    return ok(r, `archive ${path}: ${r.sessions} sessions, ${r.notes} notes; ${tail}`);
  } catch (error) {
    return fail("failed", `archive ${path} does not open: ${(error as Error).message}`);
  }
};

/** The MCP server: a long-running stdio verb, so it carries no data. */
const runMcp: Handler = async () => {
  await serveStdio(buildServer(), new StdioServerTransport());
  return ok();
};

/** stdout and stderr with an ISO timestamp before every line, so save.log can be read against
 * the commit that fixed a failure in it. */
function stamped() {
  const stamp = (text: string) =>
    text
      .split("\n")
      .map((line) => (line === "" ? line : `${new Date().toISOString()} ${line}`))
      .join("\n");
  return {
    stdout: (text: string) => process.stdout.write(stamp(text)),
    stderr: (text: string) => process.stderr.write(stamp(text)),
  };
}

if (import.meta.main) {
  process.exit(
    await runCli(
      manifest,
      "qsm-memory",
      guarded({
        save: runSave,
        search: runSearch,
        show: runShow,
        list: runList,
        note: runNote,
        notes: runNotes,
        orient: runOrient,
        doctor: runDoctor,
        mcp: runMcp,
      }),
      process.argv[2] === "save" && process.argv.includes("--log") ? { io: stamped() } : {},
    ),
  );
}
