// Per-session state the edit hook and the stop gate share: each agent's
// start point per repository root — the commit that was HEAD when the edit
// hook first ran for that agent in that root — plus block counts and halt
// records for the stop gate's capped-block rule.
//
// Keyed on the agent as well as the session, and on the root as well as the
// agent: one session runs several agents in several trees (the orchestrator
// in the main checkout, an implementer in its own worktree), and a stop gate
// judges only the trees the stopping agent itself edited, whatever
// directory the harness happens to run it in.

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runtimeDir, stateDir } from "../../../lib/paths.ts";
import { recordOf } from "./json.ts";

/** Who edited: the session, and the agent within it. The orchestrator has no
 * agent id of its own and is `MAIN_AGENT`. */
export interface Editor {
  sessionId: string;
  agentId: string;
}

export const MAIN_AGENT = "main";

/** A tree an agent edited, and the commit it is judged against there. */
export interface EditedTree {
  root: string;
  start: string;
}

/** Per-user, never a shared /tmp path: a second user's write to a shared path would EACCES and the
 * gate would silently disarm for everyone but the first user. Session state lives in the login
 * session's tmpfs, so a reboot clears it; without one it goes to the state home. */
function sessionStateDir(): string {
  const override = process.env.QSM_LANGDEV_STATE_DIR;
  return override !== undefined && override !== ""
    ? override
    : join(runtimeDir(process.env) ?? stateDir(process.env), "qsm-langdev-hook");
}

function sessionKey(sessionId: string): string {
  return sessionId.replaceAll(/[^A-Za-z0-9._-]/g, "_") || "unknown";
}

function editorDir(kind: string, editor: Editor): string {
  return join(sessionStateDir(), kind, sessionKey(editor.sessionId), sessionKey(editor.agentId));
}

function startPointPath(editor: Editor, root: string): string {
  return join(editorDir("start", editor), sessionKey(root));
}

/** Records HEAD as the agent's start point in `root`, unless one is
 * recorded already. A repository with no commit yet records nothing. */
export function recordStartPoint(editor: Editor, root: string): void {
  const path = startPointPath(editor, root);
  if (existsSync(path)) {
    return;
  }
  const head = spawnSync("git", ["rev-parse", "--verify", "-q", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  if (head.status !== 0) {
    return;
  }
  mkdirSync(editorDir("start", editor), { recursive: true });
  const tree: EditedTree = { root, start: head.stdout.trim() };
  writeFileSync(path, JSON.stringify(tree));
}

function readTree(path: string): EditedTree | null {
  try {
    const parsed = recordOf(JSON.parse(readFileSync(path, "utf8")));
    if (typeof parsed?.root !== "string" || typeof parsed.start !== "string") {
      return null;
    }
    return /^[0-9a-f]{40,64}$/.test(parsed.start)
      ? { root: parsed.root, start: parsed.start }
      : null;
  } catch {
    return null;
  }
}

export function readStartPoint(editor: Editor, root: string): string | null {
  return readTree(startPointPath(editor, root))?.start ?? null;
}

/** Every tree this agent edited in this session, with its start point.
 * Empty for an agent that edited nothing. */
export function editedTrees(editor: Editor): EditedTree[] {
  let names: string[];
  try {
    names = readdirSync(editorDir("start", editor));
  } catch {
    return [];
  }
  return names
    .toSorted()
    .map((name) => readTree(join(editorDir("start", editor), name)))
    .filter((tree): tree is EditedTree => tree !== null);
}

/** The identity a block is counted against: the regression itself, not the agent. */
function regressionDir(gate: string, editor: Editor, regression: string): string {
  const digest = createHash("sha256").update(regression).digest("hex").slice(0, 16);
  return join(editorDir(`blocks-${gate}`, editor), digest);
}

/**
 * Records one block of `regression` for `gate` and returns how many this agent has had for that
 * same regression.
 */
export function recordBlock(gate: string, editor: Editor, regression: string): number {
  const dir = regressionDir(gate, editor, regression);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${Date.now()}-${randomUUID()}`), "");
  return blockCount(gate, editor, regression);
}

function blockCount(gate: string, editor: Editor, regression: string): number {
  try {
    return readdirSync(regressionDir(gate, editor, regression)).length;
  } catch {
    return 0;
  }
}

/** Forgets every regression this agent was blocked on. */
export function clearBlocks(gate: string, editor: Editor): void {
  rmSync(editorDir(`blocks-${gate}`, editor), { recursive: true, force: true });
}

/** Writes the durable "stop allowed, regression stands" record a gate
 * leaves once its block cap is reached; returns its path. */
export function writeHalt(gate: string, editor: Editor, record: object): string {
  const dir = join(sessionStateDir(), "halts");
  mkdirSync(dir, { recursive: true });
  const path = join(
    dir,
    `${gate}-${sessionKey(editor.sessionId)}-${sessionKey(editor.agentId)}.json`,
  );
  writeFileSync(path, JSON.stringify(record, null, 2));
  return path;
}
