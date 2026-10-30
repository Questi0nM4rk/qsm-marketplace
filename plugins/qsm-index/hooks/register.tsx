// qsm-index's function-hooks module: the noun, and the native events that each call one verb of it.
// Every rule is the verb's (lib/); a hook picks the verb and hands the session what the verb said.
import type { Caught, EngineInterface, On } from "claude-code";
import { registerNoun } from "./noun.generated.ts";

/** A command whose tokens hold `git` then `commit`: a token check, not a parse; a false positive
 * only starts a refresh the build lock dedupes. */
const COMMITS = /(?:^|[\s;&|()])git[\s;&|()]+commit(?:[\s;&|()]|$)/;

/** What the next prompt owes the agent: the session start's ask or the line saying auto failed,
 * and each build that ended since. The engine has no hidden-context event outside a prompt. */
const owed: string[] = [];

/** The MCP tools whose answer can start a build: reindex, and a graph read on a stale index. */
const BUILDING_TOOLS = ["reindex", "structure", "impact", "context"].map(
  (name) => `mcp__plugin_qsm-index_qsm-index__${name}` as const,
);

/** The first line of a verb or tool answer saying a build started or already runs: reindex and
 * edited, and a graph tool's staleness line. A body never counts. */
const BUILDING =
  /^(?:started a build of |a build of .+ is already running since |index is stale; reindex (?:started|running))/;

/** Whether a verb or tool answer in text says a build started or already runs. */
function saysBuilding(text: unknown): boolean {
  return typeof text === "string" && BUILDING.test(text.split("\n", 1)[0] ?? "");
}

/** The repositories a `qsm-index wait` runs for in this session, so one build is told once. */
const waiting = new Set<string>();

/** One field of a JSON value, or null when it is not an object. */
function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, name) : null;
}

/** The line `wait --json` ends with: its text when ok, its message when not. Not the noun's
 * `unwrap`: that needs the exit code, which a `for await` over the spawn never sees. */
function finalLine(stdout: string): string {
  const envelope: unknown = JSON.parse(stdout);
  const said =
    field(envelope, "code") === "ok" ? field(envelope, "data") : field(envelope, "message");
  return typeof said === "string" ? said : `qsm-index: wait printed ${stdout.slice(0, 120)}`;
}

/** Reads whole stderr lines of `wait`: toasts each running report, and answers the repository a
 * `waiting for <repo>` line names, or null. */
function heardRepo($: EngineInterface, lines: readonly string[]): string | null {
  let repo: string | null = null;
  for (const line of lines.filter((l) => l.length > 0)) {
    const key = /^waiting for (.+)$/.exec(line)?.[1];
    if (key === undefined) {
      $.ui.toast(line.slice(0, 160));
    } else {
      repo = key;
    }
  }
  return repo;
}

/** Follows one `qsm-index wait` to its end. Its stderr names the repository first, which a second
 * waiter for the same build sees taken and leaves; later stderr lines say the build still runs. */
async function follow($: EngineInterface, argv: readonly string[]): Promise<string | null> {
  let repo: string | null = null;
  let stdout = "";
  let stderr = "";
  try {
    for await (const piece of $.process.spawn({ argv, cwd: "/" })) {
      if (!("text" in piece)) continue;
      if (piece.stream === "stdout") {
        stdout += piece.text;
        continue;
      }
      const lines = (stderr + piece.text).split("\n");
      stderr = lines.pop() ?? "";
      const key = heardRepo($, lines);
      if (key === null) continue;
      // Leaving the loop kills this second `wait` (the engine's process.spawn contract).
      if (waiting.has(key)) return null;
      waiting.add(key);
      repo = key;
    }
    return finalLine(stdout);
  } finally {
    if (repo !== null) waiting.delete(repo);
  }
}

/** Runs `qsm-index wait` beside the session for the repository holding `path`, when a build
 * started or runs: the line it ends with is a toast now and context on the next prompt. No time
 * limit: the build takes what it takes. */
function tellWhenBuilt($: EngineInterface, path: string, since: string, building: boolean): void {
  if (!building) {
    return;
  }
  const argv = ["qsm-index", "wait", path, "--since", since, "--json"];
  void (async () => {
    const line = await follow($, argv).catch(
      (error: unknown) => `qsm-index ERROR: wait for ${path}: ${String(error)}`,
    );
    if (line !== null && line.length > 0) {
      $.ui.toast(line.slice(0, 160));
      owed.push(line);
    }
  })();
}

/** What every `.catch` here does: a toast and a log for the person, and the failure as the one
 * line the agent may be told. */
function failed($: EngineInterface, event: string, error: Caught["error"]): string {
  const said = error.message ?? error.kind;
  $.ui.toast(`qsm-index ERROR: ${event}: ${said.slice(0, 120)}`);
  $.ui.log(`${event} failed open (${error.kind}): ${said}`);
  return said;
}

/** The tool runs first, then a refresh when it succeeded. The tool's result goes back unchanged;
 * a refresh that fails is a toast and a log, and never a second run of the tool. */
async function refreshAfter<E, R extends { isError?: boolean }>(
  $: EngineInterface,
  e: E,
  next: (e: E) => Promise<R>,
  refresh: (cwd: string) => Promise<unknown>,
): Promise<R> {
  const r = await next(e);
  if (r.isError !== true) {
    // A host spawn that fails with ENOENT names the command, but the session's cwd being gone
    // gives the same message, so the log names the cwd the refresh ran in.
    let cwd = "(session cwd unknown)";
    try {
      cwd = await $.session.cwd();
      // A worktree removed under the session leaves no repository there, so no index to refresh.
      if (!(await $.fs.exists(cwd))) return r;
      const since = new Date().toISOString();
      tellWhenBuilt($, cwd, since, saysBuilding(await refresh(cwd)));
    } catch (error) {
      $.ui.toast(`qsm-index ERROR: tool.call: ${String(error).slice(0, 120)}`);
      $.ui.log(`tool.call refresh failed open in ${cwd}: ${String(error)}`);
    }
  }
  return r;
}

export function register(on: On): void {
  // Adds $.index: one method per qsm-index verb, generated by
  // lib/generate-noun.ts. Never hand-edit noun.generated.ts or types/index.d.ts.
  registerNoun(on);

  on("session.start", async ($, e, next) => {
    const since = new Date().toISOString();
    const answer = await $.index.auto({ path: e.cwd });
    const ask = field(answer, "askText");
    if (typeof ask === "string") owed.push(ask);
    const building = ["started", "running"].includes(String(field(answer, "answer")));
    tellWhenBuilt($, e.cwd, since, building);
    return next(e);
  }).catch(($, e, next) => {
    owed.push(failed($, "session.start", next.error));
    return next(e);
  });

  on("prompt.submit", (_$, e, next) => {
    const lines = owed.splice(0);
    return next(lines.length === 0 ? e : { ...e, context: [...(e.context ?? []), ...lines] });
  });

  on("tool.call", { tool: BUILDING_TOOLS }, async ($, e, next) => {
    const since = new Date().toISOString();
    const r = await next(e);
    const path = typeof e.path === "string" ? e.path : e.repo;
    if (r.isError !== true && typeof path === "string") {
      tellWhenBuilt($, path, since, saysBuilding(r.text));
    }
    return r;
  });

  on("tool.call", { tool: "Bash", command: COMMITS }, ($, e, next) =>
    refreshAfter($, e, next, (cwd) => $.index.reindex({ path: cwd, ifIndexed: true })),
  ).catch(($, e, next) => {
    failed($, "tool.call", next.error);
    return next(e);
  });

  on("tool.call", { tool: ["Write", "Edit", "NotebookEdit"] }, ($, e, next) => {
    const path = e.tool === "NotebookEdit" ? e.notebook_path : e.file_path;
    return refreshAfter($, e, next, (cwd) => $.index.edited({ path, cwd }));
  }).catch(($, e, next) => {
    failed($, "tool.call", next.error);
    return next(e);
  });
}
