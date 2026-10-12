## ADDED Requirements

### Requirement: The archive is one database per machine

`qsm-memory` SHALL keep everything in one SQLite file, `$XDG_DATA_HOME/qsm-memory/memory.db`
(default `~/.local/share/qsm-memory/memory.db`); `QSM_MEMORY_DB` SHALL override the path. The
first write SHALL create the directory and the file with owner-only permissions (0600) and WAL
journaling, so two sessions ending together both write. The archive is machine data: nothing in it
is shared, synced, or committed, and no verb SHALL delete a saved session or turn.

#### Scenario: the first save creates the database with owner-only permissions

- **WHEN** `qsm-memory save <transcript>` runs and no database exists
- **THEN** the file is created at the resolved path with mode 0600 and the session is in it

#### Scenario: QSM_MEMORY_DB points the binary at another file

- **WHEN** `QSM_MEMORY_DB=/tmp/x.db qsm-memory list` runs
- **THEN** it reads `/tmp/x.db` and touches nothing under the data directory

#### Scenario: no verb removes a saved session

- **WHEN** every verb's help is listed
- **THEN** none of them deletes from `sessions` or `turns`; only `note --drop` removes a row

### Requirement: Save keeps the conversation and drops the envelope

`qsm-memory save <transcript.jsonl>` SHALL read a Claude Code transcript and store one session
row (id, kind, cwd, project, title, started and ended timestamps, transcript path, saved-at, turn
count) and its turns. It SHALL keep `user` and `assistant` records only, and from them the `text`
blocks, the `tool_use` blocks as tool name plus compact input JSON, and the `tool_result` blocks
as their text. Every other record type and every other field SHALL be dropped. A `user` record
holding only `tool_result` blocks is a result, not a human turn. A transcript with no human text
turn SHALL be skipped with the reason named. The title SHALL be the last `ai-title` record's
`aiTitle`, else the first human turn cut to 80 characters. The project SHALL be the main checkout
root of `cwd` (the parent of `git rev-parse --git-common-dir`), or `cwd` itself outside git.

Save SHALL be idempotent: turns are keyed by the record `uuid`, a second save of the same
transcript inserts only turns not yet stored and updates ended-at, turn count and saved-at.

#### Scenario: a transcript saves as text, tool calls and tool results and nothing else

- **WHEN** a transcript holds user text, assistant text, a `tool_use`, a `tool_result`, an
  `ai-title`, an `attachment`, and a `queue-operation` record
- **THEN** the archive holds four turns (text, text, tool_use, tool_result) and the other three
  records leave no row

#### Scenario: a session with no human turn is skipped

- **WHEN** the transcript has assistant records and tool results but no user text
- **THEN** save writes nothing and answers `skipped: no human turn in <path>`

#### Scenario: the title comes from the transcript's own ai-title record

- **WHEN** the transcript carries `{"type":"ai-title","aiTitle":"Fix the gate"}`
- **THEN** the session's title is `Fix the gate`

#### Scenario: a resumed session re-saves only the new turns

- **WHEN** a saved transcript gains three records through `--resume` and save runs again
- **THEN** the session has three more turns, the same id, a later ended-at, and no duplicate

### Requirement: Subagent transcripts are saved as agents of their parent

A transcript under `<session-id>/subagents/` SHALL be saved with kind `agent` and its parent's
session id. `search` and `list` SHALL leave agents out unless `--agents` is given; `show` reads
an agent session like any other.

#### Scenario: a subagent transcript is saved with its parent and left out of search by default

- **WHEN** `<id>/subagents/agent-1.jsonl` is saved and its text matches a query
- **THEN** `search <query>` prints no hit from it and `search <query> --agents` does, marked
  `agent of <id>`

### Requirement: Catch-up saves what the archive is missing

`qsm-memory save --catch-up` SHALL scan Claude Code's transcripts (`$CLAUDE_CONFIG_DIR/projects`,
default `~/.claude/projects`, main sessions and their subagents), save every transcript the
archive lacks or whose file is newer than its saved-at, at most twenty per run, and report how
many were saved and how many remain. `qsm-memory list --unsaved` SHALL name the same set and
save nothing. A transcript whose last line is not complete JSON SHALL be saved without that line,
never refused.

#### Scenario: a transcript newer than its saved-at is saved again

- **WHEN** a saved transcript's mtime is later than the session's saved-at
- **THEN** `save --catch-up` re-saves it and the count of saved names it

#### Scenario: list --unsaved names transcripts the archive lacks

- **WHEN** two transcripts on disk have no session row
- **THEN** `list --unsaved` prints their two paths and the archive is unchanged

#### Scenario: catch-up stops at twenty and says how many remain

- **WHEN** twenty-five transcripts are missing
- **THEN** one run saves twenty and answers `saved 20, 5 remain`

### Requirement: Search is full text over what was said and what was run

`qsm-memory search <query>` SHALL search FTS5 (`porter unicode61 remove_diacritics 2`) over the
text turns and the tool calls of every non-agent session on the machine, rank by BM25 plus a
recency boost, and print at most `--limit` hits (default 10), one line each:
`<date> <project> <session-id> #<seq> <title>` followed by a one-line snippet. Query words of two
or more characters become prefix matches OR'd together; `the`, `is`, `are`, `was`, `were` are
dropped. `--results` SHALL match tool results too; `--agents` adds agent sessions; `--project
<path>` and `--since <Nd|date>` narrow. When nothing matches the output SHALL be
`no session matches` and nothing else.

#### Scenario: a query hits the turn that ran the command

- **WHEN** a saved session ran `bun test plugins/qsm-memory` and the query is `bun test memory`
- **THEN** the first hit names that session and its `#<seq>` is the tool_use turn

#### Scenario: a tool result matches only with --results

- **WHEN** only a tool_result turn contains `ENOENT`
- **THEN** `search ENOENT` prints `no session matches` and `search ENOENT --results` prints the hit

#### Scenario: nothing matches says so and guesses nothing

- **WHEN** no turn contains any query term
- **THEN** the output is exactly `no session matches`

#### Scenario: --since narrows to sessions that ended after the date

- **WHEN** two sessions match and one ended nine days ago
- **THEN** `search <query> --since 7d` prints only the newer one

### Requirement: Show reads one session at three depths

`qsm-memory show <session-id>` SHALL print the session's human and assistant text turns in order,
each prefixed `#<seq> <role>`. `--tools` SHALL add tool_use turns as `#<seq> tool <name>` with the
input; `--full` SHALL add tool results. `--lines a-b` SHALL print only turns `a` through `b`. One
call prints at most 200 turns and ends with `next: --lines <b+1>-<b+200>` when more remain. A
session id prefix that matches one session SHALL be accepted.

#### Scenario: show prints the conversation text by default

- **WHEN** a session has two text turns and one tool_use
- **THEN** `show <id>` prints the two text turns and no tool line

#### Scenario: show --full includes tool results

- **WHEN** `show <id> --full` runs
- **THEN** every turn prints, tool results included

#### Scenario: a window past the end says so

- **WHEN** a session has 10 turns and `show <id> --lines 20-30` runs
- **THEN** it answers `no turns in 20-30; the session has 10`

### Requirement: List answers what was done when

`qsm-memory list` SHALL print one line per non-agent session, newest first:
`<date> <project> <session-id> <turns> <title>`. `--since <Nd|date>` SHALL narrow by ended-at,
`--project <path>` by project, `--agents` adds agent sessions, `--unsaved` is the catch-up
preview.

#### Scenario: list --since 7d prints one line per session of the week

- **WHEN** three sessions ended this week and one ended last month
- **THEN** `list --since 7d` prints three lines and the month-old session is absent

### Requirement: Notes are the one thing an agent writes

`qsm-memory note <text>` SHALL write a short-term note for the working directory's project (the
main checkout root, or the directory outside git), with a from-date and an expiry of 14 days;
`--expires <Nd>` sets another, `--keep` sets none, `--global` writes it for every project. Text
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

### Requirement: Hooks save at the end and orient at the start

The plugin SHALL ship two classic command hooks, compiled to `dist/`, and no hooks module.
`SessionEnd` SHALL run `save <transcript_path>` from the event's stdin JSON. `SessionStart`
(`startup|resume|clear|compact`) SHALL run `save --catch-up` and then print the working
directory's `notes` as `hookSpecificOutput.additionalContext`, under one line naming the archive
and how to search it. Neither hook SHALL block or exit non-zero; a failure SHALL be logged as
`qsm-memory ERROR: <verb>: <reason>` and the transcript left for the next start. The hooks read
the event's stdin and `QSM_*` variables only.

#### Scenario: session end saves the transcript

- **WHEN** the `SessionEnd` hook receives `transcript_path` and `cwd` on stdin
- **THEN** the session is in the archive and the hook exits 0

#### Scenario: session start injects the current notes

- **WHEN** the `SessionStart` hook runs in a project with two current notes
- **THEN** its `additionalContext` carries both notes and the line naming `qsm-memory search`

#### Scenario: a failed save leaves the transcript for the next start

- **WHEN** the database is unwritable at `SessionEnd`
- **THEN** the hook logs `qsm-memory ERROR: save: <reason>`, exits 0, and the next
  `save --catch-up` saves the transcript

## MODIFIED Requirements

### Requirement: One binary, same verbs over MCP, no harness inside

`qsm-memory` SHALL be one compiled binary with the verbs `save`, `search`, `show`, `list`, `note`,
`notes`, `doctor`, and `mcp`, each answering with the marketplace's outcome envelope under `--json`
(`{ code, exit, reason, message, warnings, data }`). `qsm-memory mcp` SHALL serve `search`,
`show`, `list`, `notes`, and `note` as MCP tools over stdio, backed by the same functions the
verbs call. The binary SHALL know no harness: it reads its arguments, `QSM_MEMORY_DB`,
`XDG_DATA_HOME`, and `CLAUDE_CONFIG_DIR` for the transcript directory, and nothing else of the
process that runs it. `doctor` is the health probe every marketplace binary carries: the archive
path, how many sessions, agent sessions and notes it holds, how many transcripts on disk it
lacks, and `failed` when the archive does not open.

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
`save`, `search`, `show`, `list`, `note`, `notes`, each running the binary with `--json` and
returning its envelope. `types/index.d.ts` is committed and regenerated by `lib/generate-noun.ts`.

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

## REMOVED Requirements

### Requirement: The store is found by walking up, and there are two of them

**Reason**: the archive is per machine; there is no project store and no user store to find.
**Migration**: `.memory/` directories are deleted by hand; `QSM_MEMORY_DIR` becomes
`QSM_MEMORY_DB`.

### Requirement: Four layers, each in its own place

**Reason**: there are two things, the archive and the notes, both rows in one database; no
markdown layers, no digests, no rules file.
**Migration**: none; the layers held nothing the transcripts do not.

### Requirement: A worker hands over

**Reason**: a handoff is a note beginning with the task id; the `handoff` verb, its fields and
its markdown file are gone.
**Migration**: implementer and skills call `qsm-memory note "<task-id>: ..."`.

### Requirement: A memory has a status, a source, and one exact quote

**Reason**: no agent writes long-term memory; the transcript is the source and needs no quote to
prove itself.
**Migration**: the rows worth keeping were moved into instruction files on 2026-09-28; the rest
were deleted.

### Requirement: Relations are a closed set of three

**Reason**: no memory rows, no relations.
**Migration**: none.

### Requirement: A fact changes

**Reason**: a transcript does not change; a note that no longer holds is dropped.
**Migration**: none.

### Requirement: Recall ranks with full text and three boosts, and every line says what it is

**Reason**: replaced by `search` over turns; status lines have no status to say.
**Migration**: `recall <q>` becomes `search <q>`.

### Requirement: Promotion goes up one layer on evidence, and into rules by consumption

**Reason**: a rule is written into the instruction file or skill it belongs to when it is found;
there is no layer to promote through.
**Migration**: none.

### Requirement: Rules are canonical here and projected by the harness adapter

**Reason**: no `rules.md`; the Claude home's own rules files are canonical.
**Migration**: `~/.memory/rules.md` content moves to `~/.claude/rules/`; the essentials symlink
step is removed.

### Requirement: Context is one call, small, and shaped for the task

**Reason**: the session start needs only the current notes; the SessionStart hook prints them.
**Migration**: `context` callers use `notes` and `search`.

### Requirement: Capture is staged by a hook and proposed by an agent; code decides the write

**Reason**: the hook saves the whole conversation; no model proposes and no code decides a claim.
**Migration**: digests are not migrated; Claude Code's own transcripts of the last 30 days are
saved by catch-up.

### Requirement: A hooks module asks the user, never decides for them

**Reason**: nothing is proposed, so there is nothing to ask; the hooks module and dialog are
deleted.
**Migration**: none.

### Requirement: Doctor and gc keep the store honest

**Reason**: nothing in the archive claims anything, so nothing drifts; the archive is never
deleted.
**Migration**: `doctor` stays as the marketplace's health probe (the archive opens, counts,
transcripts still unsaved); `gc` has no successor.

### Requirement: Retrieval quality is measured, not judged

**Reason**: the search proof is `bun test` over a fixture transcript set, not a verb.
**Migration**: none.

### Requirement: Nothing secret, nothing machine-bound, nothing instruction-shaped

**Reason**: the archive is machine-bound by design and holds transcripts, not claims; the secret
refusal survives on `note` alone.
**Migration**: none.
