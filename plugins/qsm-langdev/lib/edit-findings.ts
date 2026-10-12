// What the edit hook tells the model after a file edit: the file compared against its version at
// HEAD, scoped to that one file, every current finding marked new or not. Advisory only, except
// that an edited file is first fixed (lib/fixers.ts), so what a tool can rewrite is never a finding.

import { dirname, relative } from "node:path";
import { compareTrees, headline, type Verdict } from "./compare.ts";
import { findRepoRoot, isLangdevRepo, readGatesConfig } from "./config.ts";
import { fixFiles } from "./fixers.ts";
import { resolveRef } from "./gitref.ts";
import { type Editor, recordStartPoint } from "./state.ts";

// The engine gives a noun call 10 s; the checkers get what is left of 7.5 s after the binary's start
// and the fixers, so several edits at once still answer, with a slow checker marked not measured.
const DEADLINE_MS = 7500;
const CHECK_FLOOR_MS = 1000;
const MAX_OUTPUT_CHARS = 4000;

function render(file: string, verdicts: readonly Verdict[]): string {
  const body = verdicts
    .flatMap((v) => [headline(v), ...(v.lines ?? []).map((l) => `  ${l}`)])
    .join("\n");
  const cut = body.length > MAX_OUTPUT_CHARS;
  return [
    `qsm-langdev on ${file} against HEAD (+ marks what this tree added):`,
    body.slice(0, MAX_OUTPUT_CHARS),
    cut ? `[truncated at ${MAX_OUTPUT_CHARS} chars]` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The findings text for one edited file, or null when there is nothing to say: no repository, a
 * repository that never ran `qsm-langdev init`, a file outside it, or no checker covering it. */
export async function editFindings(editor: Editor, file: string): Promise<string | null> {
  const root = findRepoRoot(dirname(file));
  if (root === null) {
    return null;
  }
  recordStartPoint(editor, root);
  if (!isLangdevRepo(root)) {
    return null;
  }
  const relPath = relative(root, file);
  if (relPath.startsWith("..")) {
    return null;
  }
  fixFiles(root, [relPath]);
  const { verdicts } = await compareTrees(root, resolveRef(root, "HEAD"), "worktree", {
    at: "pre-commit",
    languages: readGatesConfig(root).languages,
    only: [relPath],
    allFindings: true,
    timeoutMs: Math.max(CHECK_FLOOR_MS, DEADLINE_MS - performance.now()),
  });
  return verdicts.length === 0 ? null : render(relPath, verdicts);
}
