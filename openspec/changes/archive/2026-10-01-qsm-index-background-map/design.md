## Context

qsm-index today is one binary with three verbs (`build`, `doctor`, `mcp serve`) and an MCP server
with four read-only tools. `build` is synchronous: it runs `graphify update <path>` (graph lands in
`<path>/graphify-out`, graphify has no output flag), runs one `semble search` to "warm a cache",
and writes an INDEX.md skeleton into a location chosen by `--out`, the shared dependency store, or
`~/.cache/qsm-index/<pathHash>/`. Nobody runs it, so the map is never there. Measured on
qsm-index-artifact-locations-9kg: 1046 files took 73 s and 15 MB; a 1884-file C# tree took 19 min
49 s. The MCP per-call timeout is 30 s, so a build can never run inside a tool call.

Three facts found while writing this change, both checked against the installed tools:

- `graphify affected "<node>"` exits 0 in three cases and only stdout tells them apart: a list
  under `Affected nodes for <node>`, the line `No affected nodes found.`, and `No unique node match
  for <node>`. `graphify path` prints `No node matching '<x>' found.` for an unknown node.
- semble 0.1.8 keeps no index on disk. Every CLI call walks and embeds the tree in memory: 2.2 s
  per `semble search` on this 748-file repository, the same on the second call. Its watcher and
  in-memory cache exist only in its own MCP server mode.
- graph.json carries `built_at_commit` (a full sha) at the top level, and each node carries
  `label`, `source_file` (relative to the repository) and `source_location` as `L<n>`, a start
  line only.

## Goals / Non-Goals

**Goals:**

- The graph of the repository a session works in exists and is fresh without anyone running a
  command, and its answers say when it is not fresh.
- `impact` and `context` answer "what depends on this" and "what is around this line".
- No tool call ever waits for a build.
- Indexing leaves nothing committable in the repository.

**Non-Goals:**

- `detect_changes` from a diff: graphify nodes have a start line and no end line, so a hunk cannot
  be mapped to the symbol it changes.
- A daemon, a file watcher, or any git hook installed into a repository.
- A subagent that answers questions over the map.
- A replacement for INDEX.md or NOTES.md.
- Incremental machinery of our own. graphify's `update` skips unchanged files through its AST
  cache; semble is called as today.

## Decisions

### One library, two thin interfaces

`plugins/qsm-index/lib/` holds every behaviour as plain functions returning `ToolOutcome`;
`scripts/cli.ts` and `lib/mcp.ts` only parse arguments and render. Layout after the change:

| File | Owns |
| --- | --- |
| `lib/run.ts` | `spawnRunner` (a 25 s timeout, under the 30 s MCP limit) and a detached spawn |
| `lib/repo.ts` | resolve a path to its git top level, HEAD, changed files, exclude file path |
| `lib/paths.ts` | cache root and `<cache>/<pathHash>/` with the names of the files in it; the dependency store and `resolveOutDir` go |
| `lib/state.ts` | lock take/release/stale check, status file read/write, decline file, freshness |
| `lib/build.ts` | the foreground build: graph symlink and exclude, `graphify update`, `semble search`, status writes |
| `lib/auto.ts` | the session-start decision, the file count, the ask text |
| `lib/refresh.ts` | which repository a PostToolUse hook may refresh, and starting it |
| `lib/tools.ts` | `search`, `structure`, `impact`, `context`, `reindex`, `status`, and the staleness line |
| `lib/doctor.ts` | unchanged |
| `lib/skeleton.ts` | deleted |

`lib/tools.ts` returns from each function the same `ToolOutcome` the CLI prints and the MCP server
wraps; the parity test compares the MCP tool list against qsm.json's commands.

Alternative considered: keep the MCP server spawning the CLI. Rejected: two processes and a
serialisation boundary for no gain, since both already import the same lib.

### Verbs

| Verb | MCP tool | Arguments | Notes |
| --- | --- | --- | --- |
| `search` | yes | `path`, `query`, `top_k?` | unchanged |
| `structure` | yes | `repo`, `op`, `node`, `to?` | argument name `repo` kept, callers exist |
| `impact` | yes | `path`, `node`, `depth?` | `graphify affected --depth` |
| `context` | yes | `path`, `target` (`file` or `file:line`) | |
| `reindex` | yes | `path` | spawns `qsm-index build <top>` detached |
| `status` | yes | `path` | |
| `build` | no | `path` | the foreground worker `reindex` spawns |
| `auto` | no | `path`, `consent?` (`yes` or `no`) | the session-start decision |
| `doctor` | no | | unchanged |
| `mcp serve` | no | | `noNoun` |

`build` stays a verb because `reindex` needs a process to spawn and a person or a test needs a
foreground path. `auto` carries the consent answer so the hook needs no second verb.

### Cache directory

`<cache>` is `QSM_INDEX_CACHE_DIR` or `~/.cache/qsm-index`; `<pathHash>` is the existing 12-hex
sha256 of the repository's absolute top-level path. Under `<cache>/<pathHash>/`:

| File | Content |
| --- | --- |
| `graphify-out/` | the symlink target; graphify writes graph.json, cache/ and the rest here |
| `build.lock` | JSON `{ "pid": <int>, "started_at": "<ISO>" }` |
| `status.json` | the status file, below |
| `build.log` | stdout and stderr of the detached build, overwritten each build |
| `declined` | empty marker: the person said no to indexing this repository |

A moved repository gets a new hash and is indexed again; with INDEX.md gone, nothing of value is
orphaned, which closes 9kg's hash concern.

### Status file

```json
{
  "repo": "/abs/top/level",
  "state": "running | done",
  "phase": "graph | semantic | null",
  "started_at": "2026-10-01T10:00:00.000Z",
  "finished_at": "2026-10-01T10:01:13.000Z | null",
  "duration_ms": 73000,
  "result": "ok | partial | failed | null",
  "cause": "graphify exited 1: ... | null",
  "built_at_commit": "<sha HEAD had when the build started>",
  "changed_at_build": { "src/a.ts": "<mtimeMs>:<size>" }
}
```

Written with write-to-temp then rename, so a reader never sees half a file. `changed_at_build` is
the porcelain set (`git status --porcelain=v1 -z`, tracked and untracked, `graphify-out` already
excluded) with each file's mtime and size, taken when the build starts.

### Freshness

The index is fresh when graph.json's `built_at_commit` equals HEAD and the current changed set
equals `changed_at_build` path for path, mtime and size included. `N` is `git rev-list --count
<built>..HEAD`; when the built commit is no longer in the object store, `N` renders as `an unknown
number of`. `K` is the count of paths whose entry differs from `changed_at_build`, in either
direction.

This refines the brief's "files are dirty" deliberately: graphify reads the working tree, so a
graph built on a dirty tree already contains those edits. Comparing against plain dirtiness would
call that index stale on every answer and rebuild it at every session start until the next commit.

### Lock

`build` takes the lock by creating `build.lock` with the `wx` flag. When the file exists, it reads
the pid; `process.kill(pid, 0)` failing with `ESRCH` means the builder is dead, and the lock is
removed and taken again once. A live pid means `reindex` answers `a build of <repo> is already
running since <started_at>` and spawns nothing. `build` releases the lock in every exit path it
controls (success, partial, failed), and the stale check covers the paths it does not (SIGKILL,
power loss). `reindex` checks the lock before spawning, so the common duplicate case costs no
process; `build` takes it again itself, so two racing `reindex` calls still yield one build.

Alternative considered: `flock`. Rejected: Bun has no portable flock, and a pid file is readable by
`status` with no extra call.

### Detached build

`reindex` spawns `qsm-index build <top>` with `detached: true`, stdio to `build.log`, and `unref()`,
then returns. The child is the binary on PATH (Iron Law 9), never a path into this repository. It
writes the status file at start (`state: running`, `phase: graph`), switches `phase` to `semantic`
after graphify, and writes the result at the end. The return-within-one-second scenario is proven
with a fake `graphify` on PATH that sleeps.

### Graph symlink and git exclude

Before graphify runs, `build`:

1. creates `<cache>/<pathHash>/graphify-out` (the target first, so the link never dangles);
2. when `<repo>/graphify-out` does not exist, creates it as a symlink to that target; when it is
   a real directory or a symlink already pointing at the target, leaves it alone; when it is a
   symlink to another `<cache>/<hash>/graphify-out`, the repository moved, and it points it at
   the target again; when it is a symlink pointing anywhere else, leaves it alone and records a
   warning in the status file, since someone made it on purpose (9kg's manual shared-tree layout);
3. resolves the exclude file with `git -C <repo> rev-parse --git-path info/exclude` (relative to
   the repository when git answers a relative path), creates it and its directory if absent, and
   appends `graphify-out` unless a line equal to it is already there.

No `--obsidian` flag: the 5000-node aggregation 9kg saw concerns graphify's HTML and Obsidian
output, not graph.json.

### File count and threshold

A repository is indexable when `git rev-parse --show-toplevel` answers; nothing else is checked.
Its size is the count of `git ls-files -z --cached --others --exclude-standard`, called directly,
not through the runner, which cuts output at 40000 characters. The threshold is 5000 files, one
constant. The estimate is linear from the 9kg small case, about 15 MB and 73 s per 1000 files,
and is worded as an estimate: the 9kg large case shows time grows with graph size, not file count.

### Session-start hook

A classic `SessionStart` command hook, `hooks/session-start.ts` compiled to `dist/session-start`
(matcher `startup|resume`, timeout 10 s), classic because it answers through stdout JSON, like
qsm-memory's. It reads `cwd` through `lib/hooks-kit.ts` and calls `auto` from the library, in
this order: not a git work tree, declined, running, fresh: nothing. No graph.json: ask. Stale at
or under 5000 files: the slice-3 detached build, nothing printed. Stale above 5000: ask. An ask
is `additionalContext` of three sentences: what was found with the count, the estimate and above
5000 a `WARNING: it will be large`; ask the person with AskUserQuestion; yes runs `qsm-index auto
<root> --consent yes`, no runs `--consent no`. The agent asks and runs the answer; a no writes the
`declined` marker. A build that cannot start says why in the context; a missing payload or a
throw prints nothing; the hook always exits 0 and never waits on a build.

### Edit counter hook

A classic `PostToolUse` command hook on `Write|Edit|NotebookEdit`, `hooks/edit-hook.ts` compiled
to `dist/edit-hook` (timeout 5 s). Classic, not a function hook, by the owner's call: a plain
process `bun test` spawns on stdin, where a function hook needs the hooks test switch. Each call
is a fresh process, so the count lives in `<cache>/<pathHash>/edits`, one absolute path per line.
It resolves the edited file's repository from the file's own directory (`file_path`, or
`notebook_path`, is absolute and names its own repository), adds the path unless it is listed,
and at the twentieth distinct path starts the detached refresh. `build` deletes `edits` when it
takes the lock, so any build, from any trigger, restarts the count. The threshold is one constant,
20.

### git commit hook

A classic `PostToolUse` command hook on `Bash`, `hooks/commit-hook.ts` compiled to
`dist/commit-hook` (timeout 5 s), reading its payload through `lib/hooks-kit.ts`. Classic for the
reason AGENTS.md names: a hook on the Bash tool must not lose a subagent's worktree, and the
payload's `cwd` is that worktree. It starts the detached refresh of `cwd`'s repository when the
command holds the token pair `git commit` (a plain token check; a false positive only starts a
refresh the lock dedupes). Measured on the compiled hook, stdin to exit, a repository needing a
refresh, ten runs: median 40.8 ms (min 36.9, max 68.8), under the 300 ms line, so the hook stays.

Both hooks go through `lib/refresh.ts`: they refresh only a repository that already has a graph
and no `declined` marker, so neither overrides the session-start question or a person's no, and a
file or `cwd` outside any repository is ignored. The refresh is `reindex` from `lib/tools.ts`. Both
exit zero and print nothing, except one `additionalContext` line naming the cause when the build
cannot start.

### Staleness line and the read tools

`structure`, `impact` and `context` compute freshness before answering (one `git rev-parse HEAD`,
one porcelain call, one stat per changed file). Stale and no build running and not declined: they
spawn the detached build exactly as `reindex` does and end the line with `reindex started`. A
build running: `reindex running`. Declined: `run reindex`, so a person's no is never overridden by
a read. The line is the answer's first line. No graph at all answers an error result with the same
action wording.

`search` carries no line: semble builds its index on every call, so it is never stale.

### impact and context

`impact` runs `graphify affected <node> --depth <d> --graph <repo>/graphify-out/graph.json` and
maps stdout: `No unique node match` becomes an error result naming the node and suggesting
`search` or `context` to find the exact label; `No affected nodes found.` becomes `unknown:
nothing in the graph depends on <node>; the graph may miss dynamic or cross-language uses`;
anything else is returned as graphify printed it.

`context` reads graph.json once (it is a file, never a subprocess), filters nodes by
`source_file` equal to the target file relative to the top level, parses `L<n>`, and sorts. With a
line, the enclosing symbol is the node with the greatest start line not above it, labelled as
nearest-above because no end line exists; then `semble find-related <file> <line> <top> -k 5`.
semble failing degrades the answer to symbols plus one line naming semble's cause.

### Failure behaviour per external tool

| Tool | Missing or failing during a build | Missing or failing during a read |
| --- | --- | --- |
| git | `build` reports `missing` (not a repository); the session-start hook prints nothing | every tool: error result naming git's cause |
| graphify | build `failed`, cause recorded, lock released | `structure`, `impact`: error result naming it; `context`: symbols still come from graph.json |
| qsm-index off PATH | the session-start, commit and edit hooks' context says the build could not start and why | not applicable |
| semble | build `partial`, cause recorded | `search`: error result; `context`: symbols plus a line naming the cause |
| graph.json unreadable | build `failed` with the parse error | graph tools: error result naming the file and the action wording |
| a call past 30 s | not applicable (detached) | error result naming the timeout (`spawnRunner`) |

### Spec sync

The durable spec is `plugins/qsm-index/openspec/specs/qsm-index/spec.md`; the repo-root
`openspec/specs/` does not hold `qsm-index`, so `openspec archive` cannot merge this delta. The
delta still validates strictly, because strict validation checks the delta's own shape. At sync,
spec-sync edits the durable file by hand, requirement by requirement:

| Durable requirement | Action |
| --- | --- |
| Index a local path | replace whole with the MODIFIED block |
| Output location resolves in a fixed priority order | delete |
| A missing dependency degrades the index, it does not fail it | replace whole with the MODIFIED block |
| Install and doctor cover the one binary | replace whole with the MODIFIED block |
| The MCP server registers four read-only lookup tools | delete; add "The MCP server registers six tools that never block" in its place |
| search finds code in a locally indexed tree | replace whole with the MODIFIED block |
| index_summary returns a dependency's index overview | delete |
| structure answers node and path questions over a built graph | replace whole with the MODIFIED block |
| list_indexes enumerates what can be queried | delete |
| every ADDED requirement | append after structure, in the delta's order |
| Slice 1 (qsm-kuf2.1) | already synced in slice 1: the three REMOVED dependency-mode requirements deleted, INDEX.md dropped from "Index a local path" and "A missing dependency", the MCP requirement renamed to "two read-only lookup tools", and "The dropped surfaces are gone" appended; slice 11 deletes "two read-only lookup tools" in place of "four" |
| Slice 2 (qsm-kuf2.2) | already synced in slice 2: "search finds code in a locally indexed tree" replaced whole with the MODIFIED block; "The CLI and the MCP server are two interfaces over one library" appended with its parity scenario only (the status scenario lands with slice 4); "A cloned repository is queried exactly like the agent's own" appended with its last sentence and the top-level scenario worded against `search` (slices 3 and 5 restore the `status` wording and the cache sentences); slice 11 replaces these two whole |
| Slice 3 (qsm-kuf2.3) | already synced in slice 3: "Index a local path" replaced with the MODIFIED block minus "into the cache location" (slice 5) and `auto` (slice 6); "A missing dependency degrades the index" replaced whole with the MODIFIED block; "A refresh never blocks and reports how far it is" appended whole; the top-level scenario of "A cloned repository" worded against `status` again; slice 11 replaces "Index a local path" whole |
| Slice 7 (qsm-kuf2.7) | already synced in slice 7: the "No structural index built yet" scenario given its MODIFIED THEN; "A stale index says so on every graph answer" inserted after structure, worded for `structure` alone, with the fresh scenario and the declined scenario against `structure`, and `run reindex` also above 5000 files (the session-start decision); slice 8 adds `impact` and the stale scenario, slice 9 `context` |
| Slice 5 (qsm-kuf2.5) | already synced in slice 5: "into the cache location" added to "Index a local path" and its scenario; "A cloned repository is queried exactly like the agent's own" given its whole MODIFIED text and the Clonned scenario; "Indexing leaves nothing in the repository that would be committed" inserted whole after it |
| Slice 4 (qsm-kuf2.4) | already synced in slice 4: "two read-only lookup tools" replaced by "The MCP server registers four tools that never block", the delta's block with four tools in place of six, "Session picks up the server" listing the four, and "Backing CLI missing" dropped for the delta's two error scenarios; the status parity scenario appended to "The CLI and the MCP server are two interfaces over one library"; slice 11 replaces "four tools that never block" whole with the six |
| Slice 6 (qsm-kuf2.6) | already synced in slice 6: "An opened project is indexed without anyone running a command" inserted whole after "Indexing leaves nothing in the repository that would be committed", in its classic-hook form (ask on no index or stale above 5000, silent refresh at or under); `auto` added to "Index a local path" ("`reindex` and `auto` SHALL run the same build detached") and to the CLI-only verbs of "The CLI and the MCP server are two interfaces over one library" |
| Slice 10 (qsm-kuf2.10) | already synced in slice 10: "Work in the session refreshes the index" inserted whole before "A refresh never blocks and reports how far it is", in its classic-hook form (two command hooks, the count in the cache, only an indexed and undeclined repository) |

The Purpose paragraph is rewritten to "the map of a repository, built in the background, and the
MCP server that queries it". Then the change is archived with `openspec archive
qsm-index-background-map --skip-specs`, and `qsm-openspec scenarios` pairs the durable titles with
the tests.

## Risks / Trade-offs

- [semble embeds per call, so `search` and `context` slow down linearly with the tree] → bounded by
  the 30 s timeout with an error naming it; the build's semble step is kept as the owner decided,
  though it warms nothing in semble 0.1.8.
- [graphify's stdout wording is its contract here] → the three strings are constants in
  `lib/tools.ts` with a test each over a fake graphify; a graphify upgrade that rewords them fails
  those tests, not a session.
- [A build on a huge repository runs for minutes and nothing shows progress but the phase] →
  `status` reports phase and elapsed time; a percentage was cut because time does not track
  file count.

## Migration Plan

Slice 1 removes the dropped surfaces; anything calling `index_summary`, `list_indexes` or `--out`
fails loud from then on. Existing `~/.cache/qsm-index/<hash>/INDEX.md` files and
`~/.local/share/qsm/deps` are deleted by hand. Existing real `graphify-out` directories in
repositories are left in place; a person who wants them moved deletes them and the next build
makes the symlink. Rollback is reverting the plugin; the cache is disposable.

## Open Questions

None. The git-commit hook's keep-or-drop is settled by the measurement its task records.
