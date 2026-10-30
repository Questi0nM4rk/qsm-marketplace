# Usage

```text
qsm-index build <path>
qsm-index reindex <path> [--if-indexed]
qsm-index edited <file> [--cwd <dir>]
qsm-index status <path>
qsm-index wait <path> --since <iso-time>
qsm-index auto <path> [--consent yes|no]
qsm-index search <path> <query> [--top_k <n>]
qsm-index structure <repo> explain|path <node> [--to <node>]
qsm-index impact <repo> <node> [--depth <n>]
qsm-index context <repo> <file>[:<line>]
qsm-index doctor
qsm-index mcp serve
```

- `--json` on any verb prints one envelope: `{ code, exit, reason, message, warnings, data }`.
- Exit codes: `ok` 0, `failed` 1 (a lookup answered an error, or a build failed), `usage` 2,
  `missing` 4 (path is not a directory inside a git repository, or the binary does not answer).
- `build` builds the repository holding the path in the foreground and prints the graph path and
  the commit it built at. A missing or failing `graphify` fails the build; a missing or failing
  `semble` makes it partial, a warning. A build already running is left running and named.
- `reindex` starts `qsm-index build <top>` detached, with its output in `build.log`, and returns
  at once. While a build holds the lock it starts nothing and says since when one runs.
- `status` reports whether the index is present, the commit it was built at against HEAD, how many
  files changed since the build (a file already dirty when the build ran counts only when it changed
  again), whether a build runs, in which phase, for how many minutes and under which pid, and the
  last result and duration. It never starts a build.
- `wait` blocks until the build of the repository ends, the one running now or one that starts or
  ends within 60 s of `--since`, and prints `qsm-index: <repo> indexed at <commit> in <n> s`, or
  the failure with its cause (exit 1); no such build is `failed` naming `build.log`. It writes
  `waiting for <repo>` to stderr first, then every ten minutes how long the build has run and its
  pid. It has no time limit, and neither has the build: a hung one is killed by its pid.
- `auto` is the session-start decision: no index, or stale above 5000 files, asks, and its data
  carries `askText`, the instruction for the agent; `--consent yes` builds, `--consent no` is
  remembered in the cache directory as `declined`. A build it cannot start is `failed`.
- `reindex --if-indexed` starts the build only for a repository that has an index the person did
  not decline, and otherwise answers ok and starts nothing. `edited` counts one file towards that
  same refresh and starts it at the twentieth distinct file edited since the last build started,
  counted in the cache directory's `edits` file; a relative file resolves against `--cwd`.
- Hooks (function hooks in `hooks/register.tsx`): `session.start` runs `auto` for
  the session's directory and the first prompt carries its `askText` as hidden context;
  `tool.call` runs `reindex <cwd> --if-indexed` after a successful Bash `git commit` and
  `edited <file> --cwd <cwd>` after Write, Edit and NotebookEdit, and returns the tool's result
  unchanged. A verb that fails is a toast and a log line. When `auto`, the refresh or an MCP tool
  answered that a build started or runs, the hooks run `wait` beside the session, one per
  repository; each running line is a toast, and the final line a toast and hidden context on the
  next prompt. A session working directory
  that no longer exists (a removed worktree) refreshes nothing and shows nothing.
- Each repository's cache directory is `<cache>/<pathHash>/` with `build.lock`, `status.json` and
  `build.log`; `<cache>` is `QSM_INDEX_CACHE_DIR` or `~/.cache/qsm-index`. The graph is there
  too, in `graphify-out/`, which `<repo>/graphify-out` links to; `graphify-out` is appended once
  to the file `git rev-parse --git-path info/exclude` names.
- `doctor` is healthy when `qsm-index` is on PATH and answers `--help`; a `graphify` of 0.8.34
  or newer is also required (older ones lose edge direction in `affected`); `semble` is listed
  beside the verdict and never changes it.
- `impact` lists what depends on a node (`graphify affected`, default depth 2); a node nothing
  depends on answers `unknown:`, never safe, because the graph misses dynamic and cross-language
  uses. `context` lists a file's symbols by start line; with `:<line>` it marks the enclosing
  symbol and adds the chunks `semble find-related` returns.
- `search`, `structure`, `impact`, `context`, `reindex` and `status` are also the MCP tools of the
  same name, with the same arguments and the same answer. Every verb takes a path inside a git
  repository and works on that repository's top level. `search` needs `semble`; `structure`,
  `impact` and `context` need `graphify`; either one running past five minutes is stopped and
  answers an error naming the limit. A build has no limit. Over MCP a failure comes back as an error
  result and the server keeps serving.
- A stale graph answer opens with `index is stale; <action>`: `reindex started`, `reindex running`,
  or `run reindex` when declined, above 5000 files, or never indexed (a read never starts a first
  build).
