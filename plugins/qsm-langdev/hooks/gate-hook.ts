#!/usr/bin/env bun

// classic: SubagentStop has no function event. Claude Code SubagentStop hook: for every tree the stopping agent edited
// this session, compares it against the commit it started from there — both
// through the per-language finding comparison (the same rule `check` runs)
// and through the structural-quality comparison (the same rule `structure`
// runs) — in one pass. A regression in either blocks the stop; a tree with
// no ruleset, or whose checker is unavailable, only warns: a stop gate must
// not hold an agent hostage to an environment gap it cannot fix mid-session.
//
// Capped: the same standing regression blocks the same agent at most three
// times, then the gate allows the stop and records a halt for the
// orchestrator, and stays allowing for as long as that regression stands.
//
// The trees judged come from THIS agent's own edit record, never from the
// directory the hook happens to run in — a worktree agent is judged on its
// own worktree even when the hook's cwd is the main checkout.
//
// Build: bun build --compile --target bun --outfile dist/gate-hook hooks/gate-hook.ts
//
// Iron Law: never crash, never block silently. On unexpected error: log to
// stderr and exit 0.

import { readHookEvent, runMain } from "../../../lib/hooks-kit.ts";
import { isRecord } from "../../../lib/outcome.ts";
import { compareTrees, type Verdict } from "../lib/compare.ts";
import { gitPaths, isLangdevRepo, readGatesConfig } from "../lib/config.ts";
import { editorOf } from "../lib/hookio.ts";
import {
  clearBlocks,
  type EditedTree,
  type Editor,
  editedTrees,
  recordBlock,
  writeHalt,
} from "../lib/state.ts";
import { compareStructure, verdict } from "../lib/structure.ts";

const GATE = "langdev";
const MAX_BLOCKS = 3;
/**
 * A checker's time limit set by a test, QSM_LANGDEV_GATE_BUDGET_MS when it is a positive whole
 * number of milliseconds, so a test reaches the not-measured path without waiting; otherwise none,
 * and the run takes the pre-commit timeout from POINTS.
 */
function testBudgetMs(): { timeoutMs?: number } {
  const override = Number(process.env.QSM_LANGDEV_GATE_BUDGET_MS);
  return Number.isInteger(override) && override > 0 ? { timeoutMs: override } : {};
}

function log(msg: string): void {
  process.stderr.write(`[qsm-langdev-gate-hook] ${msg}\n`);
}

interface Regression {
  comparison: "langdev" | "structure";
  lines: string[];
}

function describeVerdicts(verdicts: readonly Verdict[]): string[] {
  return verdicts.flatMap((v) => [v.summary, ...(v.lines ?? [])]);
}

const gap = (v: Verdict): boolean =>
  v.missing === true || v.missingConfig === true || v.notMeasured === true;

/**
 * One tree's judgement against its start commit: every regression to block the stop on, plus every
 * warning logged instead.
 */
async function judgeTree(
  tree: EditedTree,
): Promise<{ regressions: Regression[]; warnings: string[] }> {
  const regressions: Regression[] = [];
  const warnings: string[] = [];

  const { languages } = readGatesConfig(tree.root);
  const { verdicts } = await compareTrees(tree.root, tree.start, "index", {
    at: "pre-commit",
    languages,
    ...testBudgetMs(),
  });
  // Only what is staged is scored; an edit the agent left unstaged is named, never judged in silence.
  const unstaged = gitPaths(tree.root, ["diff", "--name-only", "-z"]) ?? [];
  if (unstaged.length > 0) {
    const named = unstaged.slice(0, 5).join(", ");
    const more = unstaged.length > 5 ? ` and ${unstaged.length - 5} more` : "";
    warnings.push(`not scored, not staged: ${named}${more}`);
  }
  const environment = verdicts.filter((v) => !v.pass && gap(v));
  const worse = verdicts.filter((v) => !(v.pass || gap(v)));
  if (environment.length > 0) {
    warnings.push(`langdev: ${describeVerdicts(environment).join("; ")}`);
  }
  if (worse.length > 0) {
    regressions.push({ comparison: "langdev", lines: describeVerdicts(worse) });
  }

  // The stop gate compares against the agent's own start point, so a whole session is judged as one
  // aggregate drift rather than commit by commit.
  const structure = await compareStructure(tree.root, tree.start, "index");
  const structureVerdict = verdict(structure);
  if (structureVerdict.pass) {
    // Each summary says what it is — a quality line, or a tree sentrux had no ruleset to score.
    // Both are the orchestrator's to read when it reviews this worktree; neither stops the agent.
    warnings.push(structureVerdict.summary);
  } else {
    regressions.push({
      comparison: "structure",
      lines: [structureVerdict.summary, ...structureVerdict.detail],
    });
  }

  return { regressions, warnings };
}

function describeRegressions(regressions: readonly Regression[]): string {
  return regressions.map((r) => `${r.comparison}: ${r.lines.join("; ")}`).join(" | ");
}

async function main(): Promise<void> {
  const event = readHookEvent();
  const editor: Editor = editorOf(isRecord(event) ? event : {});
  const trees = editedTrees(editor);
  if (trees.length === 0) {
    log(`agent ${editor.agentId} edited no tree this session; nothing to gate`);
    return;
  }

  // A tree that never ran `qsm-langdev init` is not ours to judge — silent,
  // same as the edit hook staying quiet in it.
  const gated = trees.filter((tree) => isLangdevRepo(tree.root));

  for (const tree of gated) {
    const { regressions, warnings } = await judgeTree(tree);
    for (const warning of warnings) {
      log(`${tree.root}: ${warning}`);
    }
    if (regressions.length === 0) {
      continue;
    }

    // Counted against the regression itself: an agent that fixes one regression and introduces
    // another starts the cap over for the new one, and a cap spent on the first never waves the
    // second through.
    const standing = describeRegressions(regressions);
    const blocks = recordBlock(GATE, editor, standing);
    if (blocks >= MAX_BLOCKS) {
      const haltPath = writeHalt(GATE, editor, {
        session_id: editor.sessionId,
        agent_id: editor.agentId,
        root: tree.root,
        halted_at: new Date().toISOString(),
        blocks,
        regressions,
      });
      log(
        `HALT after ${blocks} blocks — stop allowed, regression stands in ${tree.root} ` +
          `(${standing}). Recorded at ${haltPath}. Orchestrator/user decision needed.`,
      );
      return;
    }

    process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason:
          `[qsm-langdev] ${tree.root} is worse than this agent's start commit ${tree.start.slice(0, 12)} ` +
          `(block ${blocks}/${MAX_BLOCKS}): ${standing}. ` +
          "Fix the regressed counts or architecture in the files you touched. " +
          "Bypassing the gate is orchestrator/user-only, not a worker exit from this loop.",
      }),
    );
    return;
  }

  clearBlocks(GATE, editor);
}

await runMain(import.meta.main, main, log);
