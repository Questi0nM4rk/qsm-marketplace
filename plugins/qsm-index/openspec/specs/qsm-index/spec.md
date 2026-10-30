# qsm-index Specification

## Purpose

qsm-index is the map of a git repository, built in the background, and the MCP server that queries
it, so that an agent answers questions about how code hangs together better and in fewer steps than
by grep and file reads alone.

## Requirements

### Requirement: Index a local path

qsm-index SHALL accept a path inside a git repository and build the repository's map: it SHALL
refresh the structural dependency graph over the repository's top level (`graphify update`, no
`--obsidian` flag) into the cache location, and run one semantic search over it (`semble`). The
`build` verb SHALL do this in the foreground and print what it built and the commit it built at;
`reindex` and `auto` SHALL run the same build detached. A build SHALL record its result in the
repository's status file whether it succeeds, degrades, or fails. No caller waits on a build, so
a build SHALL have no time limit: graphify and semble run until they end.

#### Scenario: Normal indexing pass

- **WHEN** the caller runs `qsm-index build` against a path inside a git repository
- **THEN** qsm-index SHALL build the structural graph into the cache, run the semantic pass, and
  print the graph path and the commit it built at

#### Scenario: a long build completes

- **WHEN** graphify needs minutes on a large repository
- **THEN** the build waits for it and records `ok`

#### Scenario: Path is not an indexable directory

- **WHEN** the given path does not exist, is not a directory, or is not inside a git repository
- **THEN** the `build` verb SHALL report `missing` naming the path, and SHALL NOT write any output

### Requirement: A missing dependency degrades the index, it does not fail it

qsm-index SHALL continue and record a partial build when the semantic-search tool (semble) is
unavailable or fails, and SHALL record a failed build naming the cause when the structural-graph
tool (graphify) is unavailable or fails, since the graph is the map. Neither SHALL crash the build
process or leave the lock behind.

#### Scenario: Structural graph tool unavailable

- **WHEN** graphify is missing or fails during a build
- **THEN** the status file SHALL record the build failed with graphify's cause, and the lock SHALL
  be released

#### Scenario: Semantic tool unavailable

- **WHEN** semble is missing or fails during a build
- **THEN** the status file SHALL record the build partial with semble's cause, and the graph SHALL
  still be built

### Requirement: Install and doctor cover the one binary

qsm-index SHALL install as one binary, carrying the indexing verbs, the MCP server verb and the
verbs its hooks call, landing on PATH through the marketplace tool installer. `doctor` SHALL stay a
CLI verb and SHALL NOT be an MCP tool. graphify SHALL be 0.8.34 or newer, the first release whose
`affected` keeps the direction of an edge: the installer SHALL run `uv tool install -U graphifyy`
for an absent or older one and answer `already` for a new enough one, and doctor SHALL be `missing`
for one absent or older, naming that command. semble is optional: the installer SHALL NOT fetch
it, and doctor SHALL report it beside the verdict with its install command when absent, without
moving the verdict.

#### Scenario: Doctor check

- **WHEN** doctor runs for qsm-index
- **THEN** it SHALL report `ok` only when the qsm-index binary is on PATH and
  answers its help output successfully, and `missing` otherwise

#### Scenario: Binary missing

- **WHEN** doctor runs before install, or after the binary is removed from
  PATH
- **THEN** doctor SHALL report it missing rather than silently pass

#### Scenario: External tool absent

- **WHEN** semble is not on PATH
- **THEN** doctor SHALL name it beneath the verdict with the command that
  installs it, and the verdict SHALL stay healthy

#### Scenario: graphify absent or older than 0.8.34

- **WHEN** doctor runs and graphify is not on PATH or reports a version below 0.8.34
- **THEN** doctor SHALL report `missing` and name `uv tool install -U graphifyy`

### Requirement: The MCP server registers six tools that never block

qsm-index SHALL serve the MCP server under its own `mcp serve` verb, which the registration names,
and SHALL write nothing of its own to stdout, which is the protocol's channel. The verb is marked
`noNoun` in qsm.json. The server SHALL expose exactly six tools: `search`, `structure`, `impact`,
`context`, `reindex`, `status`. A tool call answers now, so its backing command SHALL be stopped
after five minutes; a build SHALL be started detached and never runs inside a call. When a call's
underlying local command fails, exits non-zero, times out, or is not on PATH, the tool SHALL return
an error result carrying the cause instead of throwing, and SHALL leave the server running for the
next call.

#### Scenario: the server lists exactly the six tools

- **WHEN** a client lists the server's tools
- **THEN** it gets `search`, `structure`, `impact`, `context`, `reindex` and `status` and no other

#### Scenario: a command that outlives the call limit answers an error result

- **WHEN** a tool's backing command runs past the per-call timeout
- **THEN** the tool returns an error result naming the timeout, and a later call still succeeds

#### Scenario: a missing backing command answers an error result and the server stays up

- **WHEN** `structure` is called and graphify is not on PATH
- **THEN** the tool returns an error result naming the missing command, and a later `status` call
  still succeeds

### Requirement: search finds code in a locally indexed tree

Given an absolute path inside a git repository and a query, `search` SHALL return the top matching
results from semble's semantic and keyword index of that repository, capped at a result count the
caller may set up to a maximum, defaulting to five. semble builds its index per call, so `search`
SHALL need no prior build. A result from the graph's own `graphify-out/` directory SHALL be dropped.

#### Scenario: Query an indexed tree

- **WHEN** the caller gives an existing absolute path and a natural-language
  or code query
- **THEN** the tool SHALL return matching results from that tree's index

#### Scenario: a chunk of the graph's own report is not a search result

- **WHEN** semble returns a chunk whose file is under `graphify-out/` among its results
- **THEN** the tool returns the other chunks and not that one

#### Scenario: Path is not absolute or does not exist

- **WHEN** the caller gives a relative path, or an absolute path that does not
  exist
- **THEN** the tool SHALL return an error result and SHALL NOT crash the
  server

### Requirement: structure answers node and path questions over a built graph

Given an absolute repository path with a built structural graph, `structure` SHALL explain one
node's neighbors (`op=explain`) or find the shortest dependency path between two nodes
(`op=path`). Two nodes with no path between them SHALL answer graphify's `No path found` text as
a result, not an error.

#### Scenario: Explain a node

- **WHEN** the caller gives a repo with a built structural index and a node
  name with `op=explain`
- **THEN** the tool SHALL return that node's description and neighbors

#### Scenario: Path between two nodes

- **WHEN** the caller gives `op=path` with a start and end node
- **THEN** the tool SHALL return the shortest dependency path between them

#### Scenario: structure answers no path found for two unconnected nodes

- **WHEN** `structure` is called with `op=path` and two nodes the graph does not connect
- **THEN** the result starts with `No path found` and is not an error

#### Scenario: No structural index built yet

- **WHEN** the given repo has no structural index built
- **THEN** the tool SHALL return an error result saying no index exists and to run `reindex`,
  SHALL start no build, and SHALL NOT crash the server

### Requirement: impact names the places that depend on a node

Given an absolute repository path and a node name, `impact` SHALL return the nodes that depend on
that node, found by `graphify affected` over the repository's `graph.json` to a depth the caller
may set, defaulting to two. A node the
graph knows and nothing depends on SHALL answer a result that starts with `unknown:` and says the
graph may miss dynamic or cross-language uses; it SHALL never answer that a change is safe. A node
name the graph cannot match to exactly one node SHALL answer an error result naming the node.

#### Scenario: impact lists the dependents of a node that has them

- **WHEN** `impact` is called with an indexed repository and a node that other nodes call or import
- **THEN** the result lists those dependent nodes with their source files

#### Scenario: impact answers unknown for a node nothing depends on

- **WHEN** `impact` is called with a node the graph holds and nothing depends on
- **THEN** the result starts with `unknown:` and does not contain the word `safe`

#### Scenario: impact answers an error for a node name the graph cannot match

- **WHEN** `impact` is called with a node name that matches no node, or more than one
- **THEN** the tool returns an error result naming that node

### Requirement: context shows the symbols of a file and the code related to a line

Given an absolute repository path and a target `file` or `file:line`, `context` SHALL return every
node of the structural graph whose source file is that file, each with its label and its start
line, ordered by line. With a line, it SHALL also mark the nearest symbol starting at or above the
line as the enclosing one, and SHALL append the chunks semble finds related to that line
(`semble find-related`). Without a line, it SHALL return the symbols only and say that a line adds
related chunks.

#### Scenario: context lists the symbols of a file ordered by start line

- **WHEN** `context` is called with an indexed repository and a file the graph holds
- **THEN** the result lists that file's symbols with their start lines in ascending order

#### Scenario: context with a line marks the enclosing symbol and adds related chunks

- **WHEN** `context` is called with `file:line` inside a symbol of an indexed file
- **THEN** the result marks the nearest symbol starting at or above that line and lists semble's
  related chunks

#### Scenario: context answers an error for a file the graph does not hold

- **WHEN** `context` is called with a file that has no node in the graph
- **THEN** the tool returns an error result naming the file

### Requirement: A stale index says so on every graph answer

`structure`, `impact` and `context` SHALL add one staleness line to their answer when the index
was built at a commit other than HEAD or files changed since the build, of the form `index is
stale; <action>`, where `<action>` is `reindex started` when the call started a detached build,
`reindex running` when one already ran, and `run reindex` when the person declined automatic
indexing for this repository or the repository is above 5000 files. No read tool SHALL wait for a
build. A fresh index SHALL add no line. `search` reads semble's live index and SHALL carry no
staleness line.

#### Scenario: a graph answer from a stale index carries the staleness line

- **WHEN** `impact` is called against an index built two commits before HEAD with three files
  changed since
- **THEN** the answer carries `index is stale; reindex started` and a detached build is running

#### Scenario: a graph answer from a fresh index carries no staleness line

- **WHEN** `structure` is called against an index built at HEAD with no file changed since
- **THEN** the answer carries no staleness line

#### Scenario: a stale answer in a declined repository says run reindex

- **WHEN** `context` is called against a stale index in a repository whose automatic indexing was
  declined
- **THEN** the staleness line ends with `run reindex` and no build starts

### Requirement: The CLI and the MCP server are two interfaces over one library

Every MCP tool SHALL have a CLI verb of the same name taking the same arguments, and both SHALL
call the same library function, so that a hook, a script, or a test reaches every behaviour with
no MCP client. The CLI MAY carry verbs the MCP server does not (`build`, `auto`, `doctor`,
`mcp serve`).

#### Scenario: every MCP tool has a CLI verb with the same arguments

- **WHEN** the MCP tool list is compared against qsm.json's commands
- **THEN** each tool has a verb of the same name whose argument names equal the tool's input names

#### Scenario: the CLI status verb and the MCP status tool give the same answer

- **WHEN** `qsm-index status <repo>` and the MCP `status` tool run against the same repository
- **THEN** both report the same fields with the same values

### Requirement: A cloned repository is queried exactly like the agent's own

qsm-index SHALL treat every git repository the same way, wherever it lives: a repository cloned
under `~/Clonned` or any other directory SHALL be indexed into the same cache, by the same build,
and queried by the same tools, with no flag and no store of its own. Every tool SHALL resolve the
`path` it is given to the top level of the git repository holding it.

#### Scenario: a repository under the Clonned directory is indexed into the cache

- **WHEN** a build runs on a repository under `~/Clonned`
- **THEN** its graph lands under `<cache>/<pathHash>/` and nothing is written beside its source

#### Scenario: a path inside a repository resolves to the repository's top level

- **WHEN** `status` is called with a subdirectory of an indexed repository
- **THEN** it reports the index of that repository's top level

### Requirement: Indexing leaves nothing in the repository that would be committed

A build SHALL keep the graph under the repository's cache directory: it SHALL create
`<cache>/<pathHash>/graphify-out`, make `<repo>/graphify-out` a symlink to it, and append the line
`graphify-out` to the file `git rev-parse --git-path info/exclude` names, once. An existing real
`graphify-out` directory, or a symlink already pointing at the cache target, SHALL be left alone.
The cache root SHALL be `QSM_INDEX_CACHE_DIR`, or `~/.cache/qsm-index` when unset. After a build,
`git status --porcelain` in the repository SHALL show nothing it did not show before.

#### Scenario: a build leaves git status unchanged

- **WHEN** a build runs in a clean repository with no `graphify-out`
- **THEN** `git status --porcelain` prints nothing afterwards

#### Scenario: a build makes graphify-out a symlink into the cache

- **WHEN** a build runs in a repository with no `graphify-out`
- **THEN** `<repo>/graphify-out` is a symlink to `<cache>/<pathHash>/graphify-out` and graph.json
  lies under the target

#### Scenario: a build appends graphify-out to the exclude file once

- **WHEN** two builds run in the same repository
- **THEN** the git exclude file holds the line `graphify-out` exactly once

#### Scenario: a build in a worktree writes the exclude file git names

- **WHEN** a build runs in a linked git worktree
- **THEN** the line lands in the file `git rev-parse --git-path info/exclude` names there

#### Scenario: a real graphify-out directory is left alone

- **WHEN** a build runs in a repository where `graphify-out` is a real directory
- **THEN** the directory stays a directory, is not moved, and the build writes the graph into it

### Requirement: An opened project is indexed without anyone running a command

A `session.start` function hook SHALL decide for the session's directory through `$.index.auto`,
which runs `qsm-index auto <cwd>`, and add nothing unless the agent must ask. Outside a git work
tree, in a repository the person declined, while a build runs, or with a fresh index it SHALL say
nothing. A stale index of at most 5000 files (counted by `git ls-files`) SHALL be refreshed by a
detached build, silently. With no index, or a stale one above 5000 files, `auto` SHALL answer
`ask` with `askText` in its data, and the first `prompt.submit` SHALL carry that text as hidden
`context`, telling it to ask the person with its own AskUserQuestion, naming the file count, an
estimate of about 15 MB and 73 seconds per 1000 files, above 5000 files a WARNING that it will be
large, and the two answers `qsm-index auto <root> --consent yes` and `--consent no`. A yes SHALL
start the build; a no SHALL be recorded in the repository's cache directory and SHALL stop every
later session start from asking for that repository. A build `auto` cannot start SHALL be
`failed`, and the hook SHALL fail open: a toast `qsm-index ERROR: session.start: <reason>` and the
reason as one context line.

#### Scenario: the session-start hook says nothing outside a git repository

- **WHEN** the session starts in a directory that is not inside a git work tree
- **THEN** `auto` exits 0 with no `askText` and writes no cache directory

#### Scenario: the session-start hook asks before the first index of a repository

- **WHEN** the session starts in a git repository with no index and no build running
- **THEN** the `askText` the hook hands the agent tells it to ask the person with AskUserQuestion
  and names `qsm-index auto <root> --consent yes` and `--consent no`, and no build starts

#### Scenario: the first ask warns that a repository above 5000 files will be large

- **WHEN** the session starts in an unindexed repository holding more than 5000 files
- **THEN** the ask carries the file count, the size and time estimate, and `WARNING: it will be
  large`

#### Scenario: a stale index of at most 5000 files is refreshed in the background without a word

- **WHEN** the session starts in a repository of 5000 files whose index is stale
- **THEN** `auto` carries no `askText` and a detached build runs to completion

#### Scenario: a stale index above 5000 files asks whether to reindex

- **WHEN** the session starts in a repository of more than 5000 files whose index is stale
- **THEN** the `askText` asks whether to reindex, with the warning, and no build starts

#### Scenario: a fresh index or a running build is left alone without a word

- **WHEN** the session starts in a repository whose index is fresh, or whose build is running
- **THEN** `auto` carries no `askText` and the status file is unchanged

#### Scenario: a recorded no stops auto from asking again

- **WHEN** `qsm-index auto --consent no` ran for a repository and a session starts there again
- **THEN** it answers `declined`, carries no `askText` and starts no build

#### Scenario: a yes starts the build and lifts an earlier no

- **WHEN** `qsm-index auto --consent yes` runs in a repository the person declined before
- **THEN** it answers `started`, the declined marker is gone, and the build runs to completion

### Requirement: Work in the session refreshes the index

A `tool.call` function hook on Bash whose command holds the tokens `git commit` SHALL, after the
tool succeeded, run `qsm-index reindex <cwd> --if-indexed`, which starts a detached refresh of the
repository in the call's working directory and returns without waiting for it. A `tool.call`
function hook on Write, Edit and NotebookEdit SHALL run `qsm-index edited <file> --cwd <cwd>`,
which counts the distinct files edited per repository since its last build started, in a file in
the repository's cache directory, and starts a detached refresh of that repository when the count
reaches 20; a build starting empties the count. Both verbs SHALL refresh only a repository that
already has an index the person did not decline, SHALL ignore a file outside any repository, and
SHALL answer ok unless the refresh cannot start, which is `failed` with the reason; the hook then
fails open with a toast and a log line, and the tool's result goes back unchanged. When the
session's working directory no longer exists, as after its worktree was removed, the hooks SHALL
run no verb and show nothing, because a removed directory has no index to refresh.

#### Scenario: a git commit through Bash starts a refresh

- **WHEN** the commit hook receives a Bash call whose command runs `git commit`
- **THEN** it runs `qsm-index reindex <cwd> --if-indexed`, which starts the detached refresh of an
  indexed repository and answers ok

#### Scenario: a commit after the session's worktree was removed shows nothing

- **WHEN** the commit hook runs and the session's working directory no longer exists
- **THEN** it runs no verb, shows no toast, and the tool's result goes back unchanged

#### Scenario: a Bash call that does not commit starts nothing

- **WHEN** the commit hook receives a Bash call whose command does not run `git commit`
- **THEN** it runs no verb

#### Scenario: the twentieth distinct edited file starts a refresh

- **WHEN** Write or Edit calls touch 20 distinct files of one indexed repository
- **THEN** `edited` starts the detached refresh once at the twentieth, and the count restarts

#### Scenario: editing the same file again does not count twice

- **WHEN** Write or Edit calls touch one file of a repository 20 times
- **THEN** no refresh starts

### Requirement: A refresh never blocks and reports how far it is

`reindex` SHALL start a detached build of the repository and return within one second, without
waiting for the build. A build SHALL hold a lock file under the repository's cache directory for
its whole run, and SHALL write its phase, its start, and on finishing its result and duration to a
status file beside the lock. A `reindex` while a build of the same repository runs SHALL start
nothing and SHALL say that a build is already running. A lock whose recorded process is no longer
alive SHALL be treated as stale and taken over. `status` SHALL report whether an index is present,
the commit it was built at against HEAD, how many files changed since the build, whether a build
is running, in which phase, for how many minutes and under which process id, and the last build's
result and duration.

#### Scenario: reindex returns before the build finishes

- **WHEN** `reindex` is called for a repository whose build takes longer than one second
- **THEN** the call returns within one second and `status` reports a build running

#### Scenario: a second reindex while a build runs starts nothing and says so

- **WHEN** `reindex` is called while a build of the same repository holds the lock
- **THEN** no second build starts and the result says a build is already running

#### Scenario: a lock left by a dead build is taken over

- **WHEN** `reindex` is called and the lock names a process that is not alive
- **THEN** a new build starts and replaces the lock

#### Scenario: status reports the last build's result and duration

- **WHEN** `status` is called after a build finished
- **THEN** it reports the result, the duration, the commit the index was built at, and no build
  running

#### Scenario: status reports an absent index for a repository never built

- **WHEN** `status` is called for a repository that has no index
- **THEN** it reports the index absent and does not start a build

### Requirement: A finished build is told to the person and the agent

`wait <path> --since <time>` SHALL block until the build of the repository holding the path ends,
the one running now or one that starts or ends within 60 seconds of `--since`, with no time limit
on the build, and SHALL print `qsm-index: <repo> indexed at <commit> in <n> s` for an ok or partial
build and `failed` with the cause for a failed one. When no such build came, it SHALL answer
`failed` naming the build log, because its caller was told a build runs. It SHALL write
`waiting for <repo>` to stderr first, and every ten minutes while the build runs, how long it has
run and its process id, so a hung build is seen; nothing stops it. When `auto` at session start,
a refresh hook, or an MCP tool call answered that a build started or runs, the hooks SHALL run
`wait` beside the session, one per repository at a time, SHALL show each running line as a toast,
and SHALL show the final line as a toast at once and add it as hidden context to the next prompt.

#### Scenario: a commit that started a build is told when the build ends

- **WHEN** the commit hook's refresh answers that it started a build, and the build ends ok
- **THEN** the person sees a toast `qsm-index: <repo> indexed at <commit> in <n> s` and the next
  prompt carries the same line

#### Scenario: a failed build is told with its cause

- **WHEN** an MCP `reindex` started a build and graphify fails
- **THEN** the toast and the next prompt carry `qsm-index: build of <repo> failed: <cause>`

#### Scenario: one build asked for from two paths is told once

- **WHEN** a commit in the repository and an MCP call on a subdirectory both answer that its build
  runs
- **THEN** one toast and one context line tell its end

#### Scenario: a build that never came is a failure

- **WHEN** `wait` runs and no build holds the lock, starts or ends within 60 seconds of `--since`
- **THEN** it answers `failed` naming the repository's build log

### Requirement: The index answers multi-hop questions better and in fewer steps

For a question that needs several hops through the code (what calls the
caller of X, which modules a change to Y reaches, where a concept is
implemented when its name is not known), an agent with the index SHALL reach a
correct answer in fewer tool calls than the same agent without it. The plugin's
eval SHALL run such questions with and without the index and SHALL fail when
the indexed run is less correct or not shorter.

#### Scenario: A question across three files

- **WHEN** the eval asks which modules are affected by changing a function
  that is called only through another function in a second file
- **THEN** the indexed run SHALL name the affected modules in fewer tool calls
  than the unindexed run

#### Scenario: The index gives no gain

- **WHEN** the indexed run is not shorter or not as correct on the eval's
  questions
- **THEN** the eval SHALL fail, naming the questions

### Requirement: The dropped surfaces are gone

qsm-index SHALL write no INDEX.md and no NOTES.md, SHALL register no `index_summary` and no
`list_indexes` tool, SHALL reject the `--out`, `--source` and `--resolvedVersion` flags, and SHALL
ignore `QSM_INDEX_DEPS_DIR`.

#### Scenario: a build writes no INDEX.md

- **WHEN** a build finishes
- **THEN** no file named INDEX.md exists in the repository or its cache directory

#### Scenario: the build verb rejects the out flag

- **WHEN** `qsm-index build <repo> --out <dir>` runs
- **THEN** it exits non-zero naming the unknown flag and writes nothing

### Requirement: The code-index skill sends the agent to the index only for questions grep cannot answer

The `code-index` skill SHALL trigger on a question about a tree the agent has not read (where
something lives, what depends on what, what a dependency exports) and SHALL NOT trigger for an
exact string or a known symbol, which is grep. It SHALL name the tool for each kind of question,
SHALL tell the agent to call `reindex` and check `status` later when a graph answer needs a build,
and SHALL refuse to treat an `unknown` from `impact` as proof that nothing depends on the node or a
`search` hit as the answer.

#### Scenario: a question the agent cannot spell

- **WHEN** the agent is asked where a concept is implemented and does not know its name
- **THEN** the skill sends it to `search`, and then to reading the places `search` lists

#### Scenario: an exact token

- **WHEN** the agent looks for an exact error message or a known symbol
- **THEN** the skill sends it to grep and not to the index

#### Scenario: impact answers unknown

- **WHEN** `impact` answers `unknown` for a node
- **THEN** the skill tells the agent to grep the name before saying nothing depends on it
