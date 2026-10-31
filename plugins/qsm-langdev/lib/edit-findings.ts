// What the edit hook tells the model after a file edit: the errors the project's own rules raise in
// that one file, compared against its version at HEAD, each marked new or not, and nothing else.
// Advisory only, except that an edited file is first fixed (lib/fixers.ts), so what a tool can
// rewrite is never a finding. How the run went goes to the hook's log: the model cannot act on it,
// and the commit scores the file again.

import { dirname, relative } from "node:path";
import { compareTrees, headline, type Verdict } from "./compare.ts";
import { findRepoRoot, isLangdevRepo, readGatesConfig } from "./config.ts";
import { fixFiles } from "./fixers.ts";
import { resolveRef } from "./gitref.ts";
import { POINTS } from "./registry.ts";
import { type Editor, recordStartPoint } from "./state.ts";

// The checkers get what is left of the edit point's timeout after the binary's start and the fixers,
// so several edits at once still answer inside the engine's 10 s, a slow checker not measured.
const CHECK_FLOOR_MS = 1000;
const MAX_OUTPUT_CHARS = 4000;

/** What one edit gives: the model's text (null when the file has no finding) and the log's lines. */
export interface EditReport {
  text: string | null;
  log: string[];
}

const NOTHING: EditReport = { text: null, log: [] };

/** A verdict whose lines are findings: the checker ran on the file and was measured. */
const measured = (v: Verdict): boolean =>
  v.skipped !== true && v.notMeasured !== true && v.missing !== true && v.missingConfig !== true;

function report(
  file: string,
  verdicts: readonly Verdict[],
  warnings: readonly string[],
): EditReport {
  const findings = verdicts.filter(measured).flatMap((v) => v.lines ?? []);
  const log = [...verdicts.map(headline), ...warnings];
  if (findings.length === 0) {
    return { text: null, log };
  }
  const body = findings.join("\n");
  const cut = body.length > MAX_OUTPUT_CHARS;
  const text = [
    `qsm-langdev: ${file} breaks this project's rules (+ marks what this tree added against HEAD):`,
    body.slice(0, MAX_OUTPUT_CHARS),
    cut ? `[truncated at ${MAX_OUTPUT_CHARS} chars]` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { text, log };
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
  const { verdicts, warnings } = await compareTrees(root, resolveRef(root, "HEAD"), "worktree", {
    at: "edit",
    languages: readGatesConfig(root).languages,
    only: [relPath],
    allFindings: true,
    timeoutMs: Math.max(CHECK_FLOOR_MS, POINTS.edit.timeoutMs - performance.now()),
  });
  return report(relPath, verdicts, warnings);
}
