## Why

An agent changing a function greps for its callers, finds the dependents late and after many
rounds, and so ships more bugs. qsm-index has the two lenses that answer this (a dependency graph
and a semantic search), but nobody builds the index, so it is never there when the agent needs it.
This change makes qsm-index a map of the repository that hooks build in the background, that says
what depends on a place and which path leads from A to B, and that the agent never maintains.

## What Changes

- **BREAKING** Remove the INDEX.md skeleton, NOTES.md, the `index_summary` and `list_indexes` MCP
  tools, the `--out`, `--source` and `--resolvedVersion` flags, the shared dependency store, the
  beside-source output rule and `QSM_INDEX_DEPS_DIR`. A cloned repository under `~/Clonned` is an
  ordinary repository and is indexed like any other.
- Keep `search` (semble), `structure` with `op=explain` and `op=path` (graphify), the `doctor`
  verb, and the code-index skill, shrunk to the new tool set.
- Add the MCP tools `impact` (what depends on a node, through `graphify affected`; a node nothing
  depends on answers "unknown", never "safe"), `context` (the symbols of a file and the chunks
  related to a line), `reindex` (returns at once, starts a detached build) and `status` (present or
  absent, behind HEAD by how much, running or not, last result and duration).
- **BREAKING** The MCP rule changes from "read-only" to "never blocks": no tool call runs longer
  than the 30 second MCP limit; a long job is started detached and polled with `status`.
- One library holds all behaviour; the CLI and the MCP server are two thin interfaces over it, and
  every MCP tool has a CLI verb with the same name and arguments.
- A build runs detached, guarded by a lock file, and reports through a status file under
  `<cache>/<pathHash>/`. A second build while one runs does nothing and says so. No daemon.
- Four triggers start a build: a session-start hook (asking through the agent before a first
  index and before a stale one above 5000 files, and remembering a "no"), a hook after a Bash
  `git commit`, a hook after 20 distinct files edited since the last index, and the agent calling
  `reindex`.
- The graph moves out of the repository: `<repo>/graphify-out` becomes a symlink into the cache,
  and `graphify-out` is appended to the repository's `.git/info/exclude`. This absorbs
  qsm-index-artifact-locations-9kg.
- Every read tool answers with one staleness line when the index is behind HEAD or the tree is
  dirty, and never rebuilds inside the call.

Not in this change: `detect_changes` (graphify nodes carry no end line, so a diff hunk cannot be
mapped to a symbol), a daemon or file watcher, installing any git hook into a repository, a haiku
subagent that answers questions over the map, and any replacement for INDEX.md or NOTES.md.

## Capabilities

### New Capabilities

None. Every requirement lands in the existing `qsm-index` capability.

### Modified Capabilities

- `qsm-index`: indexing becomes a detached background build with a lock and a status file; the
  output location rules give way to one cache location plus a graph symlink; the MCP surface loses
  `index_summary` and `list_indexes`, gains `impact`, `context`, `reindex` and `status`, and trades
  "read-only" for "never blocks"; hooks start builds; read tools report staleness.

## Impact

- Code: `plugins/qsm-index/lib/` (build, paths, tools, mcp; skeleton.ts deleted; new status and
  lock code), `plugins/qsm-index/scripts/cli.ts`, `plugins/qsm-index/qsm.json` (verbs, generated
  noun and `types/index.d.ts` regenerate), `plugins/qsm-index/hooks/` (classic command
  hooks for session start, the Bash `git commit` trigger and the edit counter).
- Docs: the code-index skill, README.md, USAGE.md, and the durable spec at
  `plugins/qsm-index/openspec/specs/qsm-index/spec.md` (synced by hand, see design.md).
- Callers: any session using `index_summary` or `list_indexes` loses them; `qsm-index build --out`
  callers lose the flag. No other plugin imports qsm-index.
- Repositories that get indexed: gain one untracked-and-excluded symlink, nothing committable.
- External tools: graphify (`update`, `explain`, `path`, `affected`) and semble (`search`,
  `find-related`), both still optional and reported by `doctor`.

## Critiques

Devil's advocate:

- *"semble re-embeds only changed files by itself" is not true of the installed semble 0.1.8.* Its
  CLI keeps no index on disk: every `semble search` and `semble find-related` walks and embeds the
  tree in memory (measured 2.2 s per call on this 748-file repository, twice, no speed-up). So the
  build's semble step warms nothing, and `search` and `context` pay a full embed per call. The
  owner's decision stands (the build calls both as today, no incremental machinery); the design
  names the consequence: those two tools are bounded by the 30 s per-call timeout and answer an
  error naming the timeout on a tree too big for it, never a hang. Waived, with that ceiling.
- *`graphify affected` answers exit 0 both for "No affected nodes found." and for "No unique node
  match for X".* Read naively both look like success, and the first is exactly the "safe" the
  owner forbade. Fixed: the design parses stdout and maps the first to "unknown" and the second to
  an error naming the node; each has its own scenario.
- *A function hook on the Bash tool loses a subagent's worktree context (AGENTS.md).* A `git
  commit` in a subagent's worktree would refresh the wrong repository. Fixed: the git-commit
  trigger is a classic PostToolUse command hook that reads `cwd` from its payload; the edit
  counter is a classic hook too, by the owner's call, reading the repository from `file_path`.
- *A lock left by a killed build blocks every later build forever.* Fixed: the lock carries the
  builder's pid, and a lock whose pid is not alive is stale and is taken over, with a scenario.
- *"Stale when files are dirty" calls a graph built on a dirty tree stale forever.* graphify reads
  the working tree, so the edits are already in the graph, yet every answer would carry the line
  and every session start would rebuild until the next commit. Fixed: the status file records the
  changed set (path, mtime, size) at build start, and staleness compares against that set.
- *`search` cannot be stale.* semble embeds per call, so a staleness line on `search` would be
  false. Fixed: the line is carried by the graph-backed tools (`structure`, `impact`, `context`).
- *"reindex started or run reindex" leaves open whether a read starts a build.* Resolved: a stale
  read starts a detached build (`reindex started`), says `reindex running` when one runs, and says
  `run reindex` only in a repository the person declined, so a read never overrides a no. Fixed in
  the spec; the owner may flip it to never-start without touching anything else.
- *"Does not stall the session" is not a number.* The design sets the keep-or-drop line for the
  git-commit hook at 300 ms median added latency over ten commits, measured by its task. Fixed,
  the number is the owner's to move.
- *Replacing a real `graphify-out` directory would destroy a graph a repository tracks on
  purpose.* Fixed: an existing real directory is left alone (owner's rule), and the build still
  works through it; scenario carried.

Future archaeologist:

- *Why does the durable spec not change in this change, and why does the delta say ADDED for
  requirements the durable spec already has?* The durable spec lives in the plugin, the repo-root
  `openspec/specs` does not hold it, so the CLI cannot merge against it. The design's "Spec sync"
  section lists, requirement by requirement, what spec-sync removes, replaces and adds by hand, and
  that archive runs with `--skip-specs`. Fixed.
- *Why 5000 files, 15 MB and 73 s per 1000 files?* They come from the measured runs recorded on
  qsm-index-artifact-locations-9kg (1046 files: 15 MB, 73 s). Named in the design. Fixed.
- *Why is `build` still a verb when the agent only calls `reindex`?* `reindex` spawns `qsm-index
  build` detached; `build` is the worker and the foreground path for a person or a test. Named in
  the design. Fixed.
- *Why is the edit counter a file in the cache?* A classic hook is a fresh process per call, so
  the count cannot live in memory; a build empties it. Named in the design. Fixed.

Scope sniper:

- *A `decline` verb and a separate `auto` verb are two verbs for one hook.* Cut to one: `qsm-index
  auto <path>` decides (start, nothing to do, ask, declined), and `--consent yes|no` answers the
  ask. The hook stays a few lines over the binary.
- *A progress percentage in `status`.* Cut: the 9kg measurements show time is not proportional to
  file count, so a percentage would lie. `status` reports the running phase and elapsed time.
- *Parsing the Bash command with shell-ast to detect `git commit`.* Cut: a false positive only
  starts a refresh the lock dedupes; a token check on the command is enough for a trigger, unlike
  a guard.
- *Measuring three repository sizes (from ocr).* Cut from this change: the estimate uses the two
  measurements already recorded; slice 10 measures only the git-commit hook latency it must judge.
- *The ocr question "does a filled INDEX.md beat grep".* Void: INDEX.md is removed.
