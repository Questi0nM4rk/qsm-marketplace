// The verbs that judge an agent's edits: "structure" compares a tree's architecture with a commit,
// "edited" prints what the checkers found in one file an agent edited.

import { type Handler, optionalString, requiredString } from "../../../lib/cli-base.ts";
import { fail, ok } from "../../../lib/outcome.ts";
import { editFindings } from "../lib/edit-findings.ts";
import { resolveRef } from "../lib/gitref.ts";
import { type Editor, editedTrees, MAIN_AGENT, readStartPoint } from "../lib/state.ts";
import {
  compareWorktreeSince,
  type StructureResult,
  type StructureVerdict,
  verdict,
} from "../lib/structure.ts";
import { err, guarded, refuse, requireRepo } from "./call.ts";

interface StructureTree {
  root: string;
  start: string;
}

/**
 * The commit `structure` compares against with no `--against`: the agent's own start point in this
 * tree when `--session` names one, else HEAD.
 */
function namedCommit(
  root: string,
  against: string | undefined,
  session: string | undefined,
  agent: string | undefined,
): string {
  if (against !== undefined) {
    return against;
  }
  if (session === undefined) {
    return "HEAD";
  }
  const editor: Editor = { sessionId: session, agentId: agent ?? MAIN_AGENT };
  const start = readStartPoint(editor, root);
  if (start !== null) {
    return start;
  }
  err(
    `[qsm-langdev] no start point for agent ${editor.agentId} of session ${session} in this tree` +
      " — comparing against HEAD. Commits the session already made here are not judged.",
  );
  return "HEAD";
}

/** The trees to judge: the single tree at `path` (or `.`), or, given
 * `--session`/`--agent` and no path, every tree that agent edited. */
function structureTreesToJudge(
  target: string | undefined,
  values: { against?: string; session?: string; agent?: string },
): StructureTree[] {
  if (target !== undefined || values.agent === undefined) {
    const root = requireRepo(target ?? ".");
    const named = namedCommit(root, values.against, values.session, values.agent);
    const start = resolveRef(root, named);
    if (start === null) {
      refuse("usage", `unknown commit '${named}'`);
    }
    return [{ root, start }];
  }
  if (values.session === undefined) {
    refuse("usage", "--agent names an agent of a session; pass --session too");
  }
  return editedTrees({ sessionId: values.session, agentId: values.agent });
}

/** The first failing tree's verdict, else the last tree's, else the
 * report of an agent that edited nothing. */
async function structureJudgeAll(trees: StructureTree[]): Promise<
  StructureVerdict & {
    tree: StructureTree | null;
    result: StructureResult | null;
  }
> {
  let last: (StructureVerdict & { tree: StructureTree; result: StructureResult }) | null = null;
  for (const tree of trees) {
    const result = await compareWorktreeSince(tree.root, tree.start);
    last = { tree, result, ...verdict(result) };
    if (!last.pass) {
      return last;
    }
  }
  return (
    last ?? {
      tree: null,
      result: null,
      pass: true,
      summary: "agent edited no tree in this session; nothing to score",
      detail: [],
    }
  );
}

const structure: Handler = guarded(async (call) => {
  const against = optionalString(call, "against");
  const session = optionalString(call, "session");
  const agent = optionalString(call, "agent");
  if (against !== undefined && session !== undefined) {
    return fail(
      "usage",
      "--against and --session both name the commit to compare against; pass one",
    );
  }
  const trees = structureTreesToJudge(optionalString(call, "path"), {
    ...(against === undefined ? {} : { against }),
    ...(session === undefined ? {} : { session }),
    ...(agent === undefined ? {} : { agent }),
  });
  const report = await structureJudgeAll(trees);
  err(`  ${report.summary}`);
  for (const line of report.detail) {
    err(`  ${line}`);
  }
  const data = {
    root: report.tree?.root ?? null,
    against: report.tree?.start ?? null,
    pass: report.pass,
    summary: report.summary,
    detail: report.detail,
    result: report.result,
  };
  return report.pass ? ok(data) : fail("worse", report.summary, data);
});

const edited: Handler = guarded(async (call) => {
  const editor: Editor = {
    sessionId: requiredString(call, "session"),
    agentId: optionalString(call, "agent") ?? MAIN_AGENT,
  };
  const text = await editFindings(editor, requiredString(call, "file"));
  return ok({ text }, text ?? "");
});

export const handlers: Readonly<Record<string, Handler>> = { structure, edited };
