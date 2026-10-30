#!/usr/bin/env bun

// qsm-memory: the per-machine archive of Claude Code sessions and the short-term notes.

import type { Database } from "bun:sqlite";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  flagArg,
  type Handler,
  optionalNumber,
  optionalString,
  requiredString,
  runCli,
} from "../../../lib/cli-base.ts";
import { serveStdio } from "../../../lib/mcp-stdio.ts";
import { fail, messageOf, type Outcome, ok } from "../../../lib/outcome.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import { blobPath, putBlob } from "../lib/blobs.ts";
import { startDetached } from "../lib/detach.ts";
import { buildServer, parseLines } from "../lib/mcp.ts";
import { catchUp, projectsDir, saveTranscript, unsavedTranscripts } from "../lib/save.ts";
import { formatHits, search } from "../lib/search.ts";
import { bounded, formatList, LIST_LIMIT, listSessions, page, show } from "../lib/sessions.ts";
import { retentionCheck } from "../lib/retention.ts";
import { openArchive, resolveDbPath } from "../lib/store.ts";
// A static import: bun's compiler inlines JSON imports into the binary, so
// `--help` works with no checkout in the room (AGENTS.md law 9).
import manifestJson from "../qsm.json" with { type: "json" };
import { handlers as noteHandlers } from "./cli-notes.ts";

const manifest = parseManifest(manifestJson, "qsm-memory/qsm.json");

const env = () => process.env;

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

/** A catch-up's counts; partial when a transcript failed to save. */
function catchUpOutcome(r: ReturnType<typeof catchUp>): Outcome {
  const skipped = r.skipped === 0 ? "" : `, ${r.skipped} skipped`;
  const failed = r.failed.length === 0 ? "" : `, ${r.failed.length} failed`;
  const message = `saved ${r.saved}${skipped}${failed}, ${r.remain} remain`;
  return r.failed.length === 0
    ? ok(r, message)
    : { code: "partial", message, data: r, warnings: r.failed };
}

const runSave: Handler = (call) => {
  const transcript = optionalString(call, "transcript");
  const catchUpAll = flagArg(call, "catchUp");
  const cwd = optionalString(call, "cwd");
  if (transcript === undefined && !catchUpAll) {
    return fail("usage", "save needs a transcript path or --catch-up");
  }
  if (flagArg(call, "detach")) {
    return saveDetached(transcript, catchUpAll, cwd);
  }
  const db = openArchive(env());
  if (catchUpAll) {
    return catchUpOutcome(catchUp(db, projectsDir(env()), env()));
  }
  if (transcript === undefined) {
    return fail("usage", "save needs a transcript path or --catch-up");
  }
  const r = saveTranscript(db, transcript, env(), cwd === undefined ? {} : { cwd });
  return r.status === "saved"
    ? ok(r, `saved ${r.id}: ${r.turns} turns, ${r.added} new`)
    : ok(r, `skipped: ${r.reason} in ${r.path}`);
};

const runSearch: Handler = (call) => {
  const limit = optionalNumber(call, "limit");
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    return fail("usage", `--limit must be a positive whole number (got '${limit}')`);
  }
  const query = optionalString(call, "query");
  if (query === undefined) {
    return fail("usage", "search needs a query");
  }
  const since = optionalString(call, "since");
  const project = optionalString(call, "project");
  const hits = search(openArchive(env()), query, {
    ...(limit === undefined ? {} : { limit }),
    ...(since === undefined ? {} : { since }),
    ...(project === undefined ? {} : { project }),
  });
  return ok(hits, formatHits(hits));
};

const runShow: Handler = (call) => {
  const spec = optionalString(call, "lines");
  if (spec !== undefined && !/^\d+-\d+$/.test(spec)) {
    return fail("usage", `--lines takes a-b (got '${spec}')`);
  }
  const session = optionalString(call, "session");
  if (session === undefined) {
    return fail("usage", "show needs a session");
  }
  const text = show(openArchive(env()), session, {
    full: flagArg(call, "full"),
    ...(spec === undefined ? {} : { lines: parseLines(spec) }),
  });
  return ok({ text }, text);
};

const runList: Handler = (call) => {
  const limit = optionalNumber(call, "limit") ?? LIST_LIMIT;
  if (!Number.isInteger(limit) || limit <= 0) {
    return fail("usage", `--limit must be a positive whole number (got '${limit}')`);
  }
  const db = openArchive(env());
  if (flagArg(call, "unsaved")) {
    const paths = unsavedTranscripts(db, projectsDir(env()));
    return ok(page(paths, limit), paths.length === 0 ? "nothing unsaved" : bounded(paths, limit));
  }
  const since = optionalString(call, "since");
  const project = optionalString(call, "project");
  const rows = listSessions(db, {
    ...(since === undefined ? {} : { since }),
    ...(project === undefined ? {} : { project }),
  });
  return ok(page(rows, limit), formatList(rows, limit));
};

const runBlobPut: Handler = (call) => {
  const r = putBlob(env(), requiredString(call, "file"));
  return ok(r, `${r.sha256}  ${r.path}${r.stored ? "" : " (already stored)"}`);
};

const runBlobPath: Handler = (call) => {
  const path = blobPath(env(), requiredString(call, "sha256"));
  return ok({ path }, path);
};

const count = (db: Database, table: string) =>
  db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? 0;

/** The health probe qsm-setup runs and the session start repeats: the archive opens and Claude
 * Code keeps its transcripts, or the reason it does not. A retention that deletes is failed, never
 * a warning: what it deletes is the person's and never comes back. */
const runDoctor: Handler = () => {
  const path = resolveDbPath(env());
  const retention = retentionCheck(env());
  try {
    const db = openArchive(env());
    const r = {
      path,
      sessions: count(db, "sessions"),
      notes: count(db, "notes"),
      unsaved: unsavedTranscripts(db, projectsDir(env())).length,
      retentionDays: retention.data?.days ?? null,
    };
    const tail =
      r.unsaved === 0
        ? "nothing unsaved"
        : `${r.unsaved} unsaved, the next session start saves them`;
    const archive = `archive ${path}: ${r.sessions} sessions, ${r.notes} notes; ${tail}`;
    return retention.data === undefined
      ? fail("failed", `${archive}; ${retention.message}`, r)
      : ok(r, `${archive}; ${retention.message}`);
  } catch (error) {
    return fail("failed", `archive ${path} does not open: ${messageOf(error)}`);
  }
};

/** The MCP server: a long-running stdio verb, so it carries no data. */
const runMcp: Handler = async () => {
  await serveStdio(buildServer(), new StdioServerTransport());
  return ok();
};

const stamp = (text: string) =>
  text
    .split("\n")
    .map((line) => (line === "" ? line : `${new Date().toISOString()} ${line}`))
    .join("\n");

/** stdout and stderr with an ISO timestamp before every line, so save.log can be read against
 * the commit that fixed a failure in it. */
function stamped() {
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
      {
        save: runSave,
        search: runSearch,
        show: runShow,
        list: runList,
        "blob put": runBlobPut,
        "blob path": runBlobPath,
        ...noteHandlers,
        doctor: runDoctor,
        mcp: runMcp,
      },
      process.argv[2] === "save" && process.argv.includes("--log") ? { io: stamped() } : {},
    ),
  );
}
