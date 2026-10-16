// The short-term note verbs of qsm-memory: "note" adds or drops one, "notes" lists the current ones,
// and "orient" prints the session-start block the hook shows the model.

import { flagArg, type Handler, optionalNumber, optionalString } from "../../../lib/cli-base.ts";
import { fail, ok } from "../../../lib/outcome.ts";
import { addNote, currentNotes, dropNote, formatNotes, NOTE_DEFAULT_DAYS } from "../lib/notes.ts";
import { orientOutcome } from "../lib/orient.ts";
import { projectOf } from "../lib/project.ts";
import { openArchive } from "../lib/store.ts";

const runNote: Handler = (call) => {
  const db = openArchive(process.env);
  const drop = optionalString(call, "drop");
  if (drop !== undefined) {
    dropNote(db, drop);
    return ok({ dropped: drop }, `dropped ${drop}`);
  }
  const expires = optionalNumber(call, "expires");
  if (expires !== undefined && expires <= 0) {
    return fail("usage", `--expires must be a positive number of days (got '${expires}')`);
  }
  const row = addNote(db, {
    text: optionalString(call, "text") ?? "",
    project: flagArg(call, "global") ? null : projectOf(process.cwd()),
    expiresDays: flagArg(call, "keep") ? null : (expires ?? NOTE_DEFAULT_DAYS),
  });
  return ok(row, `noted ${row.id}`);
};

const runNotes: Handler = (call) => {
  const all = flagArg(call, "all");
  const rows = currentNotes(openArchive(process.env), projectOf(process.cwd()), { all });
  return ok(rows, formatNotes(rows, all));
};

/** The session-start block; the hook shows its text to the model. */
const runOrient: Handler = (call) =>
  orientOutcome(openArchive(process.env), optionalString(call, "cwd") ?? process.cwd(), {
    env: process.env,
  });

export const handlers: Readonly<Record<string, Handler>> = {
  note: runNote,
  notes: runNotes,
  orient: runOrient,
};
