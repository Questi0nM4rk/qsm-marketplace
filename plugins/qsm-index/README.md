# qsm-index

A dependency graph and a semantic search over a git repository, so the agent can ask "where is X"
and "what breaks if I change X" without a research subagent.

## Why it exists

Grep finds words, and an agent that navigates a codebase by words misses what
the code means and how it hangs together. qsm-index exists to give the agent
two other lenses over a repository: a graph of what depends on what, and a
semantic search that returns the chunks that matter, both from one persisted
index a session can query as tools. It takes the stance that the index is
built once and read many times, so building is cheap to repeat and reading is
cheap to trust. It refuses to be a language server or a substitute for reading
the file. When the harness ships structural and semantic search of its own,
this plugin has no reason to exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `code-index` | Fires when you need to find something in a tree the agent has not read, or see what depends on what. |
| Hook | `session.start`, `prompt.submit` | Decide whether to build an index, and ask you once through the first prompt. |
| Hook | `tool.call` | Refresh an indexed repository after a Bash `git commit` and after 20 distinct files edited. |
| MCP | `qsm-index` | Six tools that never block: `search`, `structure`, `impact`, `context`, `reindex`, `status`. |
| CLI | `qsm-index` | 11 verbs, see [USAGE.md](USAGE.md). |

## Install

```bash
claude plugin install qsm-index@qsm-marketplace
bun plugins/qsm-index/scripts/install.ts
uv tool install semble   # optional
```

Install compiles `qsm-index` into `$QSM_BIN_DIR` (default `~/.local/bin`) and upgrades `graphify`
to 0.8.34 or newer with `uv tool install -U graphifyy`. Without `semble`, a search is partial. See
[INSTALL.md](INSTALL.md).

## Use

Ask the agent: "what depends on parser.ts?" or "where is the config loaded?"

```bash
qsm-index reindex "$PWD"      # starts a background build, returns at once
qsm-index status "$PWD"       # present or absent, behind HEAD, running, last result
qsm-index search "$PWD" "where is the parser"
qsm-index structure "$PWD" explain parser.ts
qsm-index impact "$PWD" parser.ts
qsm-index context "$PWD" src/parser.ts:40
qsm-index doctor
```

A path inside a git repository stands for the repository's top level.

## Caveats

- A build keeps its lock, status file and log under `<cache>/<pathHash>/`, where `<cache>` is
  `QSM_INDEX_CACHE_DIR` or `~/.cache/qsm-index`. A second build while one runs starts nothing. A
  lock left by a killed build is taken over.
- The graph lives in the cache too. A build makes `<repo>/graphify-out` a symlink to it and adds
  `graphify-out` to the repository's git exclude file, so `git status` shows nothing new. A real
  `graphify-out` directory is left alone.
- A repository never indexed, or declined, is left alone by the hooks.
- `impact` answers `unknown:` for a node nothing depends on, never "safe": the graph misses dynamic
  and cross-language uses.
- Not a language server: to see a symbol's definition, open the file.
