# qsm-memory Specification

## Purpose

qsm-memory is the per-machine archive of Claude Code sessions: the main sessions a person typed
in, as text, searchable; the transcript file on disk is the full context.

## Requirements

### Requirement: The archive is one database per machine

`qsm-memory` SHALL keep everything in one SQLite file, `$XDG_DATA_HOME/qsm-memory/memory.db`
(default `~/.local/share/qsm-memory/memory.db`); `QSM_MEMORY_DB` SHALL override the path. The
first write SHALL create the directory and the file with owner-only permissions (0600) and WAL
journaling, so two sessions ending together both write; processes that open a missing database at
once SHALL all succeed, one creating it and the rest opening it. The archive is machine data: nothing in it
is shared, synced, or committed, and no verb SHALL delete a saved session or turn.

#### Scenario: the first save creates the database with owner-only permissions

- **WHEN** `qsm-memory save <transcript>` runs and no database exists
- **THEN** the file is created at the resolved path with mode 0600 and the session is in it

#### Scenario: catch-ups that start together on a missing database all save

- **WHEN** four `qsm-memory save --catch-up` runs start at once and no database exists
- **THEN** each answers `saved`, and none fails with `database is locked`

#### Scenario: QSM_MEMORY_DB points the binary at another file

- **WHEN** `QSM_MEMORY_DB=/tmp/x.db qsm-memory list` runs
- **THEN** it reads `/tmp/x.db` and touches nothing under the data directory

#### Scenario: no verb removes a saved session

- **WHEN** every verb's help is listed
- **THEN** none of them deletes from `sessions` or `turns`; only `note --drop` removes a row

### Requirement: Save takes only main sessions a person typed in, and only their text

`qsm-memory save <transcript.jsonl>` SHALL read a Claude Code main transcript and store one session
row (id, cwd, project, title, started and ended timestamps, transcript path, saved-at, turn count)
and its turns. A turn is the text of a `user` or `assistant` record: a user turn only when a person
typed it, never a `tool_result`, a hook or system injection, a notice the harness queued, or the
prompt of a headless run. No tool call, no tool result, and no other record type is stored. A user
turn of only local slash-command wrappers (`/clear`, `/compact`) is not a prompt and the wrappers
are stripped from a typed one. A transcript with no human turn, and any transcript under
`<session-id>/subagents/`, SHALL be skipped with the reason named, and a skipped transcript SHALL be
recorded with its mtime so `list --unsaved` and `doctor` do not count it again until the file
changes; saving the session once it has a human turn SHALL delete that record, and opening an
archive SHALL delete a record whose session is already saved. The title SHALL be the last `ai-title` record's `aiTitle`, else the first human turn cut to
80 characters. The project SHALL be the main checkout root of `cwd` (the parent of
`git rev-parse --git-common-dir`, run with `LC_ALL=C` so the refusals it reads are English in any
locale), or `cwd` itself outside git.

#### Scenario: a transcript saves as text and nothing else

- **WHEN** a transcript holds user text, assistant text, a `tool_use`, a `tool_result`, an
  `ai-title`, an `attachment`, and a `queue-operation` record
- **THEN** the archive holds two turns, the user text and the assistant text, and the other
  records leave no row

#### Scenario: a session with no human turn is skipped and not counted again

- **WHEN** the transcript has assistant records and a headless prompt but nothing a person typed
- **THEN** save writes no session and answers `skipped: no human turn in <path>`, and
  `list --unsaved` no longer names the file until it changes

#### Scenario: a session skipped before its first prompt is saved once, not again

- **WHEN** a transcript with no human turn is caught up, a typed prompt is appended, and
  `save --catch-up` runs twice
- **THEN** the first of those runs answers `saved 1`, the second names nothing, and
  `list --unsaved` prints `nothing unsaved`

#### Scenario: a subagent transcript is never saved

- **WHEN** `<id>/subagents/agent-1.jsonl` is given to `save`
- **THEN** it answers `skipped: subagent transcript in <path>` and the archive is unchanged

#### Scenario: the title comes from the transcript's own ai-title record

- **WHEN** the transcript carries `{"type":"ai-title","aiTitle":"Fix the gate"}`
- **THEN** the session's title is `Fix the gate`

#### Scenario: a resumed session re-saves only the new turns

- **WHEN** a saved transcript gains four records through `--resume` and save runs again
- **THEN** the session has the new text turns, the same id, a later ended-at, and no duplicate

### Requirement: Catch-up saves the main transcripts the archive is missing

`qsm-memory save --catch-up` SHALL scan Claude Code's main transcripts (`$CLAUDE_CONFIG_DIR/
projects/<dir>/<session-id>.jsonl`, default `~/.claude/projects`, never `subagents/`), save every
one the archive lacks or whose file is newer than its saved-at or its skip, at most twenty per
run, and report how many were saved, how many skipped, how many failed and how many remain. Only
saved and skipped files SHALL count against the twenty, so a file that always fails cannot starve
the newer ones; the run gives up after forty attempts. A
transcript that vanishes during the scan is not pending, and one that cannot be read or saved
SHALL be named in the outcome (`partial`, one warning each, exit 0) while the others still save;
it stays unsaved for the next run. `qsm-memory list
--unsaved` SHALL name the same set and save nothing. A transcript whose last line is not complete
JSON SHALL be saved without that line, never refused.

#### Scenario: list --unsaved names only the main transcripts the archive lacks

- **WHEN** a main transcript with a typed prompt, one without, and a subagent transcript are on
  disk
- **THEN** `list --unsaved` names the two main ones and not the subagent's

#### Scenario: catch-up saves only the interactive one and remembers the other

- **WHEN** `save --catch-up` runs on those files
- **THEN** it answers `saved 1, 1 skipped, 0 remain`, and `list --unsaved` then prints
  `nothing unsaved`

#### Scenario: a transcript newer than its saved-at is saved again

- **WHEN** a saved transcript's mtime is later than the session's saved-at
- **THEN** `save --catch-up` re-saves it and the count of saved names it

#### Scenario: one unreadable transcript does not stop the others

- **WHEN** a transcript that cannot be read lies beside two saveable ones and `save --catch-up`
  runs
- **THEN** it answers `saved 2, 1 failed, 0 remain`, the code is `partial`, a warning names the
  unreadable file, and the other two are in the archive

#### Scenario: files that always fail do not starve the new ones

- **WHEN** two unreadable transcripts sort before four saveable ones and the limit is two
- **THEN** two are saved, the two failures are named, and two remain

#### Scenario: catch-up stops at twenty and says how many remain

- **WHEN** twenty-five transcripts are missing
- **THEN** one run saves twenty and answers `saved 20, 5 remain`

### Requirement: Text the harness writes into a user record is not a user turn

A user record whose text, after the slash-command wrappers are stripped, begins with
`<task-notification>`, `<bash-stdout>`, `<bash-stderr>`, `[Request interrupted by user`, or `This
session is being continued from a previous conversation` (a compaction summary) SHALL NOT be stored
as a user turn and SHALL NOT count as a human turn. `<bash-input>` is kept: the person typed it.
Opening an archive SHALL delete such turns already stored, delete a session left with no user turn,
correct the turn counts, and `VACUUM` when anything was deleted; a second open finds nothing.

#### Scenario: harness text is not a prompt

- **WHEN** a transcript holds a task notification, a compaction summary, bash output and an
  interrupt marker as user records, and an assistant answer
- **THEN** it has no human turn and save skips it; a transcript with a `<bash-input>` turn has one

#### Scenario: stored harness turns are purged, once

- **WHEN** an archive holds a compaction summary and a `<bash-input>` turn beside a typed prompt
- **THEN** opening it removes the summary and its search hit, keeps the other two, and a second
  open changes nothing

### Requirement: Search is full text over what was said

`qsm-memory search <query>` SHALL search FTS5 (`porter unicode61 remove_diacritics 2`) over the
text turns of every saved session on the machine, rank by BM25 plus a recency boost, and print at
most `--limit` hits (default 10), one line each: `<date> <project> <session-id> #<seq> <title>`
followed by a one-line snippet. Query words of two or more characters become prefix matches OR'd
together; `the`, `is`, `are`, `was`, `were` are dropped.
`--project <path>` (any directory of the project, a worktree included) and `--since <Nd|date>`
narrow; a `--since` that is neither `Nd` nor a date SHALL fail as `usage`, never mean no filter.
When nothing matches the output SHALL be `no session matches` and nothing else.

#### Scenario: a query hits the turn that said it

- **WHEN** a saved session's user turn says `the typecheck gate is red`
- **THEN** `search typecheck gate` ranks that session first and the line names its `#<seq>`

#### Scenario: nothing matches says so and guesses nothing

- **WHEN** no turn contains any query term
- **THEN** the output is exactly `no session matches`

#### Scenario: a --since nobody can parse is refused

- **WHEN** `list --since "last week"` or `search x --since 7days` runs
- **THEN** it exits `usage` naming the value and the accepted forms, and prints no session

#### Scenario: --since narrows to sessions that ended after the date

- **WHEN** two sessions match and one ended nine days ago
- **THEN** `search <query> --since 7d` prints only the newer one

### Requirement: Show reads the saved text, or the transcript file for the full context

`qsm-memory show <session-id>` SHALL print the session's saved text turns in order, each prefixed
`#<seq> <role>`. `show <session-id> --full` SHALL instead read the transcript file at the path
stored with the session and print every conversation turn in it, tool calls as `#<n> tool <name>
<input>` and tool results as `#<n> result: <text>`, numbered by position in the file. When that
file is gone, `--full` SHALL fail as `missing`, name the path, and say the saved text is all that
is left. `--lines a-b` SHALL print only turns `a` through `b`. One call prints at most 20 000
characters of turns, so a whole session never lands in the reader's context, and ends with
`next: --lines <b+1>-<last>` when more remain, `b` the last turn printed and `last` the last turn
asked for. A first turn longer than the budget alone is cut there and says
`[turn cut at 20000 of <n> characters]`; the rest of that turn is not readable through show. A session id prefix that
matches one session SHALL be accepted.

#### Scenario: show prints the conversation text

- **WHEN** a session has two saved text turns
- **THEN** `show <id>` prints the header and the two turns

#### Scenario: show --full reads the transcript file

- **WHEN** the session's transcript has a tool call and a tool result
- **THEN** `show <id> --full` prints the text turns, the call and the result from the file

#### Scenario: show --full says so when the file is gone

- **WHEN** the transcript file was deleted and `show <id> --full` runs
- **THEN** it exits `missing` naming the path, and `show <id>` still prints the saved text

#### Scenario: a window past the end says so

- **WHEN** a session whose last turn is #10 and `show <id> --lines 20-30` runs
- **THEN** it answers `no turns in 20-30; the last turn is #10`

#### Scenario: a long session stops at the character budget

- **WHEN** a session has 46 turns of 3 000 characters each and `show <id>` runs
- **THEN** it prints turns 1 to 6 and ends with `next: --lines 7-46`

### Requirement: List answers what was done when

`qsm-memory list` SHALL print one line per saved session, newest first:
`<date> <project> <session-id> <turns> <title>`. `--since <Nd|date>` SHALL narrow by ended-at,
`--project <path>` by project (any directory of it, a worktree included), `--unsaved` is the
catch-up preview. At most `--limit` lines are printed (default 20); when there are more, the last
line is `<n> more: --limit <total>`. `--limit` SHALL be a positive whole number, else a usage
error. With `--json` the data is `{ rows, more }`, so a reader of the data also learns how many
were left out. The MCP `list` tool takes the same `limit`.

#### Scenario: a long list stops at the limit and says how many more

- **WHEN** twenty-five sessions are saved
- **THEN** `list` prints twenty lines and `5 more: --limit 25`, and `list --limit 25` prints all

#### Scenario: list --since 7d prints one line per session of the week

- **WHEN** three sessions ended this week and one ended last month
- **THEN** `list --since 7d` prints three lines and the month-old session is absent

### Requirement: Notes are the one thing an agent writes

`qsm-memory note <text>` SHALL write a short-term note for the working directory's project (the
main checkout root, or the directory outside git), with a from-date and an expiry of 14 days;
`--expires <N>` sets another, N a number of days, `--keep` sets none, `--global` writes it for every project. Text
matching a secret shape SHALL be refused with `secret`. `qsm-memory notes` SHALL print the
project's current notes and the global ones, newest first, each as `<id> from <date> until
<date|kept>: <text>`; `--all` prints every project's. `note --drop <id>` SHALL remove one.
Expired notes SHALL be purged on every read. A handoff is a note whose text begins with the task
id; there is no other verb for it.

#### Scenario: a note written in a worktree is read from the main checkout

- **WHEN** `note "qsm-abc: gate red on typecheck, fix first"` runs in `<repo>/.claude/worktrees/x`
- **THEN** `notes` run in `<repo>` prints it

#### Scenario: an expired note is gone on the next read

- **WHEN** a note's expiry passed
- **THEN** `notes` does not print it and the row is deleted

#### Scenario: --keep holds a note past the default expiry

- **WHEN** `note "..." --keep` was written 30 days ago
- **THEN** `notes` still prints it with `until kept`

#### Scenario: a note with a token shape is refused

- **WHEN** the text contains a string shaped like an API key
- **THEN** the write is refused with `secret` and the text is not echoed back

### Requirement: A session starts with one short briefing

`qsm-memory orient [--cwd <dir>]` SHALL print one block of at most 1500 characters, built with no
model call, from the project of `cwd`: the last three saved sessions, each with its date, title,
count of user turns and what it left behind, then the in-progress tasks of the repository and the
epic each belongs to, the project's current notes, and one line on how to search (`qsm-memory
search <words>`, then `qsm-memory show <id>`). What a session left behind is read, not guessed:
the commits on the branch checked out at `cwd` whose committer date falls between the session's
start and end (their count and the newest subject), from `git log`, and the tasks the task tool
reports closed in the same window (their ids); a session with neither shows no outcome. A title
alone says what a session was about, never what it changed, so the next session would have to
search to learn it. Outside a git repository the commits SHALL be left out silently; a `git` that
fails inside one SHALL fail the verb. The project key of `cwd` follows the same rule: only "not a git repository" or a
directory that is gone means `cwd` itself; a `git` that is missing or refuses fails the verb.
The tasks come from the task tool (qsm-tasks), run by the binary for each of the first three
tasks and its parent. When the project has no task tracker the task lines SHALL be
left out; a project with a tracker and no task tool on `PATH` SHALL fail the verb as `missing`,
naming qsm-tasks as the plug-in that installs it, and a task tool that fails SHALL fail it as
`failed` with the reason. Notes SHALL take the room the other lines leave, newest first, then a
count of the older ones; under 100 characters of room they SHALL be a count only. The block SHALL
never exceed 1500 characters. With `--json` the block is `data.text`.

#### Scenario: the block names sessions, the task and its epic, notes and how to search

- **WHEN** a project has six saved sessions and a note, and the task tool reports task `x-1.2`
  in progress under epic `x-1`
- **THEN** the block lists the three newest sessions, names `x-1.2` with `epic x-1` and its
  title, holds the note, and ends with the search line

#### Scenario: a session shows the commits and closed tasks of its window

- **WHEN** the branch at `cwd` holds two commits made during the newest session and one made
  before any listed session, and the task tool reports task `x-1.1` closed during the newest
  session
- **THEN** the newest session's line says `2 commits`, quotes the newer subject and names
  `closed x-1.1`, and no line counts the older commit

#### Scenario: without a tracker the task lines are left out

- **WHEN** the project has no task tracker
- **THEN** the block has the sessions, notes and search line and no error

#### Scenario: a tracker without the task tool is missing

- **WHEN** the project has a task tracker and the task tool is not on `PATH`
- **THEN** `orient` exits `missing` naming that qsm-tasks installs it

#### Scenario: long titles and many notes still fit in 1500 characters

- **WHEN** six titles of 300 characters and twelve notes of 130 characters exist
- **THEN** the block is at most 1500 characters, holds the newest note, and ends with the search
  line

#### Scenario: only the tasks it shows are looked up

- **WHEN** eight tasks are in progress
- **THEN** the task tool is asked to show only the first three and their parents

#### Scenario: a git that cannot run fails the briefing

- **WHEN** `git` is not on `PATH` while `orient` runs
- **THEN** it exits `failed` naming `git rev-parse`, and a `cwd` outside any repository or already
  removed is still its own project

#### Scenario: a task tool that fails is loud

- **WHEN** the task tool exits non-zero inside a project that has a tracker
- **THEN** `orient` exits `failed` with the reason

### Requirement: Hooks save at the end and brief at the start

The plugin SHALL ship one hooks module, `hooks/register.tsx`, with function hooks that call its
own `$.memory` noun and hold no rule of their own. `session.end` and `session.start` SHALL run
`save --catch-up --detach`, which saves the ending session too. The first `prompt.submit` of a
session, and the first after a `/clear` or a `session.compact`, SHALL run `orient --cwd <cwd>`
and attach its text as hidden `context` on `prompt.submit`, never on a `classic.*` event,
`prompt.section` or `prompt.compose`. `save --detach` SHALL start the same save in a detached
`qsm-memory` process and return at once, the child's outcome appended to `save.log` beside the
archive, every line led by an ISO timestamp (`save --log`, which stamps no other verb), so the 1.5 s the engine gives the session-end chain covers only the start. No hook SHALL
block the event: any failure SHALL be toasted as `qsm-memory ERROR: <event>: <reason>` and the
event goes on; a failed save leaves the transcript for the next start.

#### Scenario: session end saves the transcript

- **WHEN** `save --catch-up --detach` runs, as the `session.end` hook runs it
- **THEN** it answers ok at once and the detached save puts the session in the archive

#### Scenario: the first prompt carries the briefing

- **WHEN** the first prompt of a session is submitted
- **THEN** its `context` is the text `orient --cwd <cwd>` answered, once, and the next prompt
  carries none

#### Scenario: a briefing that cannot be built toasts and the prompt still enters

- **WHEN** `orient` fails
- **THEN** a toast `qsm-memory ERROR: prompt.submit: <reason>` appears and the prompt goes on

#### Scenario: a save.log line carries its date

- **WHEN** a detached save runs and prints its outcome
- **THEN** every line of it starts with an ISO-8601 timestamp

#### Scenario: a failed save leaves the transcript for the next start

- **WHEN** the database is unwritable when the detached save of `session.end` runs
- **THEN** `save.log` holds `failed: <reason>`, and the next `save --catch-up` saves the
  transcript

### Requirement: One binary, same verbs over MCP, no harness inside

`qsm-memory` SHALL be one compiled binary with the verbs `save`, `search`, `show`, `list`, `note`,
`notes`, `orient`, `doctor`, and `mcp`, each answering with the marketplace's outcome envelope
under `--json` (`{ code, exit, reason, message, warnings, data }`). `qsm-memory mcp` SHALL serve
`search`, `show`, `list`, `notes`, and `note` as MCP tools over stdio, backed by the same
functions the verbs call. The binary SHALL know no harness: it reads its arguments,
`QSM_MEMORY_DB`, `XDG_DATA_HOME`, and `CLAUDE_CONFIG_DIR` for the transcript directory, and
nothing else of the process that runs it. `doctor` is the health probe every marketplace binary
carries: the archive path, how many sessions and notes it holds, how many main transcripts on
disk it lacks, and `failed` when the archive does not open.

#### Scenario: doctor reports the archive and what it lacks

- **WHEN** one transcript on disk is not yet saved
- **THEN** `qsm-memory doctor` answers ok and names `1 unsaved`

#### Scenario: a client lists five tools

- **WHEN** a client spawns `qsm-memory mcp`, sends `initialize` and `tools/list`
- **THEN** the tools are exactly `search`, `show`, `list`, `notes`, `note`

#### Scenario: Run with no harness

- **WHEN** `qsm-memory search "x"` runs from a plain shell
- **THEN** it answers with no environment beyond `PATH` and the optional `QSM_MEMORY_DB`

### Requirement: The binary's verbs are a noun on the engine

The plugin's hooks-facing contract SHALL be the `$.memory` noun generated from `qsm.json`:
`save`, `search`, `show`, `list`, `note`, `notes`, `orient`, each running the binary with
`--json` and returning its envelope. `types/index.d.ts` is committed and regenerated by
`lib/generate-noun.ts`.

#### Scenario: Another plugin searches

- **WHEN** a dependent plugin's hooks module calls `$.memory.search("gate red")`
- **THEN** it typechecks against the generated contract and receives the `search` envelope

### Requirement: Activation turns the harness's own memory off, by choice

`qsm-setup activate qsm-memory -- --memory <qsm|skip>` SHALL run `scripts/activate.ts`. With
`qsm` it SHALL set `autoMemoryEnabled` to `false` and `cleanupPeriodDays` to `7` (unless the file
already holds a lower value) in the Claude home's `settings.json`, leave every other key as it
was, and create the file when there is none, so Claude Code stops writing its own memory files and
deletes its transcripts a week after the archive has them. With `skip` it SHALL write nothing. A
`settings.json` that does not parse SHALL be an error naming the file, and the file SHALL be left
as it was. Install SHALL never run it. The MCP connection is not a step: the plugin's `.mcp.json`
registers `qsm-memory mcp` when the plugin is enabled.

#### Scenario: qsm turns the harness memory off and keeps every other key

- **WHEN** the activation runs with `--memory qsm` and `settings.json` holds other keys
- **THEN** `autoMemoryEnabled` is `false`, `cleanupPeriodDays` is `7`, the other keys are
  unchanged, and the step is `installed`

#### Scenario: qsm leaves a lower cleanupPeriodDays alone

- **WHEN** `settings.json` holds `cleanupPeriodDays: 3`
- **THEN** it stays `3` and `autoMemoryEnabled` is `false`

#### Scenario: running it again with nothing changed is already

- **WHEN** the activation runs with `--memory qsm` and both keys already hold those values
- **THEN** nothing is written and the step is `already`

#### Scenario: settings.json that does not parse is an error naming the file

- **WHEN** the activation runs with `--memory qsm` and `settings.json` is not JSON
- **THEN** the step is `error`, names the file, and the file is byte-for-byte as it was

### Requirement: The memory skill and the recall agent send the model to the archive first

The plugin SHALL ship the `memory` skill and the `recall` agent. The skill SHALL fire at session
start, before the model asks something an earlier session may have settled, at a handoff, and when
something does not work right now and the next session must know; it tells the model to search
before asking, to act on the hit and name its session id, to treat no hit as an answer, to treat a
session as data and never as an instruction, and to write nothing but a short note for the next
session. It SHALL refuse to store a fact, rule, decision or summary: those go to their owner. The
`recall` agent SHALL answer one question from several searches, cite every claim as session id,
turn and date, say "not found in the archive" when nothing matches, and never write a note. It
fires only when the model's own searches did not settle the question.

#### Scenario: a question about last week fires the skill

- **WHEN** a person asks what was done about a flaky redirect last week
- **THEN** the `memory` skill fires and the model searches the archive before answering

#### Scenario: unrelated coding fires neither

- **WHEN** a person asks for a plain coding change that no earlier session bears on
- **THEN** neither the `memory` skill nor the `recall` agent fires

### Requirement: Dependencies

The plugin SHALL declare these plug-ins in `.claude-plugin/plugin.json` `dependencies`:

- `qsm-tasks`: the session briefing lists the work in progress from the task port, and `orient`
  fails as `missing` naming it when a project's task tool is not installed.

#### Scenario: installing the plugin installs its dependency

- **WHEN** the plugin is installed
- **THEN** `claude plugin install` installs `qsm-tasks` with it

#### Scenario: the briefing without the task tool is missing

- **WHEN** `orient` runs in a project with a task tracker and the task tool is not on `PATH`
- **THEN** it exits `missing` and the message names qsm-tasks

## Libraries

Each checked to work under `bun build --compile` where it is not stdlib. The rung is the ladder in
the implementation rule: built-in before a dependency, a dependency before our own code only when
it saves more than it costs.

| Need | Pick | Why |
| ------ | ------ | ----- |
| SQLite, FTS5, BM25 | `bun:sqlite` | Built in; `porter unicode61 remove_diacritics 2`, `bm25()` and `snippet()` work interpreted and compiled. `better-sqlite3` is a native addon Bun cannot bundle. |
| CLI verbs, typed flags, help | root `lib/cli-base.ts` | The marketplace's one parser, reading this plugin's `qsm.json`: verbs, flags, help, completions and the generated noun cannot drift from one source. |
| MCP over stdio | `@modelcontextprotocol/sdk` + `zod` | The compiled binary answers `initialize` and `tools/list`; one zod schema per tool. Cost: the SDK bundles HTTP transports we never use. |
| Transcript parsing | `JSON.parse` per line | `<projects>/<slug>/<session>.jsonl`, one record per line; a half-written last line is skipped. No JSONL library. |
| Project key | `git rev-parse --path-format=absolute --git-common-dir` | The main checkout of any worktree, one process call; the working directory outside git. |
| Tasks for the briefing | the task tool, spawned | No tracker leaves the lines out; a tracker without the tool fails. No tracker library. |
| Secret shapes | ~10 regexes, ours | Only `note` refuses; the archive holds only the text a person and the model wrote. |
| Tests | `bun test`, `:memory:` database, `mkdtempSync`, a transcript builder, a stub task tool | Nothing touches the real archive or the real transcript directory. |

Two dependencies, the MCP SDK with `zod`, in the plugin's own `package.json`. Everything else is stdlib or
ours. A `bun build --compile` binary is about 90 MB because it embeds the runtime.

## Extension points

Each is an addition behind the same verbs, none a rewrite.

- A one-line summary per session from a model, when `list` proves too coarse: a column on
  `sessions`, written by a separate verb, never by `save`.
- A second machine's archive read alongside: `search --db <path>`, never a merge.
