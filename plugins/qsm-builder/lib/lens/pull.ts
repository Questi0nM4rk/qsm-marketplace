// `qsm-builder lens pull <artifact-url>`: the edits saved on a published lens become the same
// tasks the local server makes, and each row is marked taken. The artifact database is reached
// through a port, so the flow is proved against a fake one; the real adapter asks `claude -p`
// to use its ArtifactData tool, since the database has no other door for a command line.

import { isRecord, messageOf, onPath } from "../../../../lib/outcome.ts";
import { QsmError } from "../../../../lib/qsm-error.ts";
import { createEditTask, EditError, parseEdit, run } from "./edits.ts";

export interface EditRow {
  readonly id: string;
  readonly data: Record<string, unknown>;
}

/** The artifact database as pull needs it: the rows of `edits`, and one row marked taken. */
export interface EditRows {
  readonly list: (url: string) => Promise<readonly EditRow[]>;
  readonly markTaken: (url: string, id: string) => Promise<void>;
}

export interface Pulled {
  readonly created: readonly { row: string; task: string; title: string }[];
  readonly rejected: readonly { row: string; reason: string }[];
  /** rows whose task was made but which could not be marked taken: the next pull would repeat them */
  readonly unmarked: readonly { row: string; reason: string }[];
  /** rows already taken */
  readonly taken: number;
}

/** Each untaken row becomes a task, then is marked taken; a refused row stays untaken and is named. */
export async function pullEdits(root: string, url: string, rows: EditRows): Promise<Pulled> {
  const created: { row: string; task: string; title: string }[] = [];
  const rejected: { row: string; reason: string }[] = [];
  const unmarked: { row: string; reason: string }[] = [];
  let taken = 0;
  for (const row of await rows.list(url)) {
    if (row.data.taken === true) {
      taken += 1;
      continue;
    }
    try {
      const made = await createEditTask(root, parseEdit(row.data, root));
      created.push({ row: row.id, task: made.id, title: made.title });
    } catch (error) {
      if (!(error instanceof EditError) || error.status === 500) {
        throw error;
      }
      rejected.push({ row: row.id, reason: error.message });
      continue;
    }
    const marked = await rows.markTaken(url, row.id).then(
      () => null,
      (error: unknown) => messageOf(error),
    );
    if (marked !== null) {
      unmarked.push({ row: row.id, reason: marked });
    }
  }
  return { created, rejected, unmarked, taken };
}

/** Runs one `claude -p` turn that may use only ArtifactData; haiku, because the flow is given. */
async function ask(prompt: string): Promise<string> {
  if (!onPath("claude")) {
    throw new QsmError(
      "missing",
      "claude is not on PATH: pull reads the artifact database through it",
    );
  }
  const { out, err, code } = await run([
    "claude",
    "-p",
    "--model",
    "haiku",
    "--allowedTools",
    "ArtifactData",
    "--",
    prompt,
  ]);
  if (code !== 0) {
    throw new QsmError("failed", `claude -p failed (${code}): ${err.trim() || out.trim()}`);
  }
  return out.trim();
}

function isEditRow(value: unknown): value is EditRow {
  return isRecord(value) && typeof value.id === "string" && isRecord(value.data);
}

/** The rows from a reply that is a JSON array, or null. */
function parseRows(text: string): EditRow[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) {
    return null;
  }
  const items: unknown[] = parsed;
  const rows: EditRow[] = [];
  for (const item of items) {
    if (!isEditRow(item)) {
      return null;
    }
    rows.push(item);
  }
  return rows;
}

/** The real database: unverified against a live artifact; the test uses a fake port. */
export const artifactRows: EditRows = {
  async list(url) {
    const text = await ask(
      `With the ArtifactData tool, action "list", url ${url}, collection "edits", read every page. Reply with only a JSON array of {"id": <doc id>, "data": <the document>}, nothing else.`,
    );
    const rows = parseRows(text);
    if (rows === null) {
      throw new QsmError(
        "failed",
        `the artifact rows did not come back as a JSON array: ${text.slice(0, 200)}`,
      );
    }
    return rows;
  },
  async markTaken(url, id) {
    await ask(
      `With the ArtifactData tool, action "update", url ${url}, collection "edits", doc_id "${id}", data {"taken": true}. Reply "done" when it succeeded.`,
    );
  },
};
