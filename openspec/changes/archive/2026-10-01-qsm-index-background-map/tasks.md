Every slice is test first: the scenario titles it names are written as bun `test("…")` titles byte
for byte, watched failing, then made to pass. Every slice ends with `bun run validate`, `bun run
lint`, `bun run typecheck` and `bun test` green, and updates README.md and USAGE.md for the verbs
it touches. Paths are under `plugins/qsm-index/` unless they start with `lib/` of the root.

## 1. Remove the dropped surfaces

Owns: `lib/skeleton.ts` and its test (deleted), `lib/paths.ts`, `lib/build.ts`, `lib/tools.ts`,
`lib/mcp.ts`, `scripts/cli.ts`, `qsm.json`, `hooks/noun.generated.ts`, `types/index.d.ts`,
`skills/code-index/SKILL.md`. Blocked by: nothing.

- [ ] 1.1 Tests: "a build writes no INDEX.md", "the build verb rejects the out flag"
- [ ] 1.2 Delete INDEX.md and NOTES.md writing, `--out`, `--source`, `--resolvedVersion`, the
  dependency store root, `resolveOutDir` and `QSM_INDEX_DEPS_DIR`; drop `index_summary` and
  `list_indexes` from the server and their tests
- [ ] 1.3 Regenerate the noun and `types/index.d.ts` from qsm.json
- [ ] 1.4 Shrink the code-index skill to `search` and `structure`; drop the INDEX.md sections

## 2. One library with the CLI and the MCP server thin over it

Owns: `lib/tools.ts`, `lib/mcp.ts`, `lib/repo.ts` (new), `scripts/cli.ts`, `qsm.json`,
`lib/mcp.test.ts`, `scripts/cli.test.ts`. Blocked by: 1.

- [ ] 2.1 Tests: "every MCP tool has a CLI verb with the same arguments", "a path inside a
  repository resolves to the repository's top level" (against `search`, `status` lands in 3)
- [ ] 2.2 Add `lib/repo.ts` (git top level, HEAD, changed set); make `search` and `structure`
  CLI verbs calling the same functions the server calls; every tool resolves `path` to the top
  level
- [ ] 2.3 Tests carried over: "Query an indexed tree", "Path is not absolute or does not exist",
  "Explain a node", "Path between two nodes", "Doctor check", "Binary missing", "External tool
  absent"

## 3. Detached build with lock and status file, and the status verb

Owns: `lib/state.ts` (new), `lib/build.ts`, `lib/run.ts` (detached spawn), `lib/paths.ts`,
`lib/tools.ts` (`reindex`, `status`), `scripts/cli.ts`, `qsm.json`. Blocked by: 2.

- [ ] 3.1 Tests with a fake slow `graphify` on PATH: "reindex returns before the build finishes",
  "a second reindex while a build runs starts nothing and says so", "a lock left by a dead build is
  taken over", "status reports the last build's result and duration", "status reports an absent
  index for a repository never built", "Normal indexing pass", "Path is not an indexable
  directory", "Structural graph tool unavailable", "Semantic tool unavailable"
- [ ] 3.2 Lock (`wx`, pid, stale check), status file (temp then rename, fields per design),
  `build.log`; `build` writes phase and result and releases the lock on every exit it controls
- [ ] 3.3 CLI verbs `reindex` and `status`; the status freshness fields (`built_at_commit` against
  HEAD, `N`, `K` against `changed_at_build`)

## 4. MCP reindex and status tools, and the never-blocks rule

Owns: `lib/mcp.ts`, `lib/mcp.test.ts`, `lib/run.ts`. Blocked by: 3.

- [ ] 4.1 Tests: "a command that outlives the call limit answers an error result", "a missing
  backing command answers an error result and the server stays up", "the CLI status verb and the
  MCP status tool give the same answer"
- [ ] 4.2 Register `reindex` and `status`; replace "read-only" with "never blocks" in the server
  description and the skill

## 5. Graph symlink and git exclude

Owns: `lib/build.ts`, `lib/repo.ts` (exclude path), `lib/build.test.ts`. Blocked by: 3. Absorbs
qsm-index-artifact-locations-9kg.

- [ ] 5.1 Tests in throwaway git repositories (full cleanup written): "a build leaves git status
  unchanged", "a build makes graphify-out a symlink into the cache", "a build appends
  graphify-out to the exclude file once", "a build in a worktree writes the exclude file git
  names", "a real graphify-out directory is left alone", "a repository under the Clonned directory
  is indexed into the cache"
- [ ] 5.2 Target first, then the link, then the exclude line; a foreign symlink is left alone with a
  warning in the status file; no `--obsidian`

## 6. Session-start hook that asks through the agent

Owns: `lib/auto.ts` (new), `hooks/session-start.ts` (new), `hooks/hooks.json`,
`scripts/session-start.test.ts` (new), `scripts/cli.ts`, `qsm.json`, `hooks/noun.generated.ts`,
`types/index.d.ts`. Blocked by: 5 (so the first automatic build already lands in the cache).

- [ ] 6.1 Tests in `scripts/session-start.test.ts`, spawning the hook on stdin with `{ "cwd" }`:
  "the session-start hook says nothing outside a git repository", "the session-start hook asks
  before the first index of a repository", "the first ask warns that a repository above 5000
  files will be large", "a stale index of at most 5000 files is refreshed in the background
  without a word", "a stale index above 5000 files asks whether to reindex", "a fresh index or a
  running build is left alone without a word", "a recorded no stops auto from asking again", "a
  yes starts the build and lifts an earlier no"
- [ ] 6.2 `auto` verb with `--consent`; `git ls-files` count; decline marker file; the classic
  SessionStart hook per design, printing `additionalContext` only to ask

## 7. Staleness line in the graph read tools

Owns: `lib/tools.ts` (staleness line, auto-start from a stale read), `lib/tools.test.ts`.
Blocked by: 4 and 6 (needs `reindex` from the library and the decline marker).

- [ ] 7.1 Tests: "a graph answer from a fresh index carries no staleness line", "a stale answer in
  a declined repository says run reindex", "No structural index built yet", and the stale case on
  `structure` (the `impact` title lands in 8)
- [ ] 7.2 One function renders the line for every graph tool; `search` carries none

## 8. impact tool

Owns: `lib/tools.ts` (`impact`), `lib/mcp.ts`, `scripts/cli.ts`, `qsm.json`, the noun and types,
the skill row. Blocked by: 7.

- [ ] 8.1 Tests over a fake `graphify` printing its three real outputs: "impact lists the
  dependents of a node that has them", "impact answers unknown for a node nothing depends on",
  "impact answers an error for a node name the graph cannot match", "a graph answer from a stale
  index carries the staleness line", "structure answers no path found for two unconnected nodes"
- [ ] 8.2 CLI verb and MCP tool with the same arguments

## 9. context tool

Owns: `lib/tools.ts` (`context`), `lib/mcp.ts`, `scripts/cli.ts`, `qsm.json`, the noun and types,
the skill row. Blocked by: 8 (shared registration files).

- [ ] 9.1 Tests over a fixture graph.json and a fake `semble`: "context lists the symbols of a file
  ordered by start line", "context with a line marks the enclosing symbol and adds related
  chunks", "context answers an error for a file the graph does not hold"
- [ ] 9.2 CLI verb and MCP tool; test "the server lists exactly the six tools", which can only
  pass once all six exist

## 10. git-commit and 20-edit hooks, with the latency measurement

Owns: `hooks/commit-hook.ts` (new), `hooks/edit-hook.ts` (new), `lib/refresh.ts` (new),
`scripts/refresh-hooks.test.ts` (new), `hooks/hooks.json`, `lib/paths.ts` (the `edits` file),
`lib/build.ts` (empties it). Blocked by: 6.

- [x] 10.1 Tests in `scripts/refresh-hooks.test.ts`, spawning each hook on stdin: "a git commit
  through Bash starts a refresh", "a Bash call that does not commit starts nothing", "the
  twentieth distinct edited file starts a refresh", "editing the same file again does not count
  twice"
- [x] 10.2 Two classic PostToolUse command hooks, each with the comment naming why it is classic;
  the edit count in the cache's `edits` file, emptied when a build starts
- [x] 10.3 Measure the commit call's added latency, median of ten; record it in the task; above
  300 ms remove the commit hook and say so. Measured 40.8 ms median: kept

## 11. Sync the durable spec and archive

Owns: `plugins/qsm-index/openspec/specs/qsm-index/spec.md`, the change directory. Blocked by: 10
and 9. Added to the proposed order because the durable spec lives in the plugin and the CLI
cannot merge it.

- [ ] 11.1 Apply the design's spec-sync table by hand; `openspec validate --strict` green
- [ ] 11.2 `openspec archive qsm-index-background-map --skip-specs`; close
  qsm-index-artifact-locations-9kg and qsm-index-async-create-and-prove-ocr naming this change
