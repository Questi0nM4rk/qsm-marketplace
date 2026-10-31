// What the edit hook tells the model after a file edit: the errors the project's own rules raise in
// that one file, checked in place in the live checkout, against nothing else. Advisory only, except
// that an edited file is first fixed (lib/fixers.ts), so what a tool can rewrite is never a finding.
// How the run went goes to the hook's log: the model cannot act on it, and the commit compares the
// file against HEAD again.

import { dirname, relative } from "node:path";
import { checkInPlace } from "./compare.ts";
import { findRepoRoot, isLangdevRepo, readGatesConfig } from "./config.ts";
import { fixFiles } from "./fixers.ts";
import { POINTS } from "./registry.ts";
import { type Editor, recordStartPoint } from "./state.ts";

const MAX_OUTPUT_CHARS = 4000;

/** What one edit gives: the model's text (null when the file has no finding) and the log's lines. */
export interface EditReport {
  text: string | null;
  log: string[];
}

const NOTHING: EditReport = { text: null, log: [] };

function modelText(file: string, findings: readonly string[]): string | null {
  if (findings.length === 0) {
    return null;
  }
  const body = findings.join("\n");
  const cut = body.length > MAX_OUTPUT_CHARS;
  return [
    `qsm-langdev: ${file} breaks this project's rules:`,
    body.slice(0, MAX_OUTPUT_CHARS),
    cut ? `[truncated at ${MAX_OUTPUT_CHARS} chars]` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The report for one edited file; nothing at all for no repository, a repository that never ran
 * `qsm-langdev init`, or a file outside it. */
export async function editFindings(editor: Editor, file: string): Promise<EditReport> {
  const root = findRepoRoot(dirname(file));
  if (root === null) {
    return NOTHING;
  }
  recordStartPoint(editor, root);
  if (!isLangdevRepo(root)) {
    return NOTHING;
  }
  const relPath = relative(root, file);
  if (relPath.startsWith("..")) {
    return NOTHING;
  }
  fixFiles(root, [relPath]);
  // The edit point's timeout counts from the binary's start, so the start and the fixers come out of
  // it, and several edits at once still answer inside the engine's 10 s, a slow checker not measured.
  const { findings, log } = await checkInPlace(root, relPath, {
    languages: readGatesConfig(root).languages,
    deadlineMs: POINTS.edit.timeoutMs,
  });
  return { text: modelText(relPath, findings), log };
}
