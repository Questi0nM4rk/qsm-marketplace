## ADDED Requirements

### Requirement: Pack moves transcripts nobody uses into a monthly archive, counted in days of use

`qsm-memory pack` SHALL move the transcripts nobody uses any more into one compressed archive and
SHALL never delete a transcript that is not in a checked archive. A day of use is a local calendar
date on which a session in the archive started, and today when `pack` runs. A transcript's age is
the number of days of use after the local date of its file's last change; a transcript of age 7 or
more is idle. A day without Claude Code adds nothing to any age, so a break never ages a
transcript, and a day with one session on a break adds one.

`pack` SHALL run only when all of these hold, and otherwise answer `ok` naming the first that does
not, moving nothing: the recorded retention choice is `qsm`; 30 days have passed since
`activated_at`; 30 days have passed since `last_pack_at` when there is one; and at least 3 of the 5
calendar dates before today are days of use, so after a break the person has 3 full days of use to
reopen what still matters before a pack can run. `last_pack_at` SHALL be claimed in one transaction
before the run, so two runs started together move files once, and SHALL be set back to its earlier
value when the run fails.

A run SHALL take every idle main transcript (`projects/<dir>/<id>.jsonl` under the Claude home)
together with its session directory (`projects/<dir>/<id>/`), except one the archive has not saved
since its last change (the set `list --unsaved` names) and one whose session is live, that is,
named by a `sessions/<pid>.json` under the Claude home whose pid is a running process. It SHALL
write them to `<data dir>/transcripts/<YYYY-MM-DD>.tar.zst` (today's date, entries relative to the
Claude home, `zstd -19`), owner-only, first as `<name>.part`; test it with `zstd -t`; list it and
compare the entries to the files taken; rename it; and only then remove the originals and record
each session in the archive's `packed` table with the archive path. A file whose size or mtime
changed after it was listed SHALL stay in place and be named (`partial`). A missing `tar` or `zstd`
SHALL fail `missing` naming the tool, and an unreadable `sessions/` entry SHALL fail `failed`
naming the file, both before anything is moved. The outcome SHALL name how many sessions moved,
the bytes before and after, and the archive path, and restore is
`tar --zstd -xmf <archive> -C <claude home> <entries>`, which gives the restored files today's
mtime so the next run does not take them again.

#### Scenario: a transcript idle for 7 days of use is packed and restores

- **WHEN** a saved transcript last changed before 7 days of use, the gate holds, and `pack` runs
- **THEN** the transcript and its session directory are in `transcripts/<today>.tar.zst`, gone from
  `projects/`, and `tar --zstd -xmf` of that archive into the Claude home lets
  `claude --resume <id>` open the session

#### Scenario: a week of vacation between two Mondays keeps the session

- **WHEN** a transcript changed on a Monday, sessions started Tuesday to Friday, none for the next
  seven days, and one on the Monday after
- **THEN** its age is 5 and `pack` leaves it in place

#### Scenario: two sessions on a break add two days, not the break

- **WHEN** a transcript changed before a 14-day break with sessions on 2 of those days
- **THEN** the break adds 2 to its age

#### Scenario: the first days back after a break pack nothing

- **WHEN** no session started for 20 days, then sessions start on three consecutive days
- **THEN** `pack` on each of the three days answers `ok` naming the activity gate and moves
  nothing, and on the fourth day the gate holds

#### Scenario: the first 30 days after activation pack nothing

- **WHEN** `activated_at` is 10 days ago and every other condition holds
- **THEN** `pack` answers `ok` naming the grace and moves nothing

#### Scenario: a second run within 30 days packs nothing

- **WHEN** `pack` moved files 12 days ago and runs again
- **THEN** it answers `ok` naming the last pack's date and moves nothing

#### Scenario: an unsaved or live transcript stays whatever its age

- **WHEN** one idle transcript is newer than its saved copy and another is named by a running
  session's `sessions/<pid>.json`
- **THEN** `pack` moves neither

#### Scenario: a missing zstd moves nothing

- **WHEN** `zstd` is not on `PATH` and a pack is due
- **THEN** `pack` fails `missing` naming `zstd`, `projects/` is unchanged, and `last_pack_at` is
  back to its earlier value

## MODIFIED Requirements

### Requirement: Show reads the saved text, or the transcript file for the full context

`qsm-memory show <session-id>` SHALL print the session's saved text turns in order, each prefixed
`#<seq> <role>`. `show <session-id> --full` SHALL instead read the transcript file at the path
stored with the session and print every conversation turn in it, tool calls as
`#<n> tool <name> <input>` and tool results as `#<n> result: <text>`, numbered by position in the
file. When that file is gone and the session is in the `packed` table, `--full` SHALL fail as
`missing`, name the archive, and give the `tar --zstd -xmf` command that restores it; when it is
gone and not packed, `--full` SHALL fail as `missing`, name the path, and say the saved text is all
that is left. `--lines a-b` SHALL print only turns `a` through `b`. One call prints at most 20 000
characters of turns, so a whole session never lands in the reader's context, and ends with
`next: --lines <b+1>-<last>` when more remain, `b` the last turn printed and `last` the last turn
asked for. A first turn longer than the budget alone is cut there and says
`[turn cut at 20000 of <n> characters]`; the rest of that turn is not readable through show. A
session id prefix that matches one session SHALL be accepted.

#### Scenario: show prints the conversation text

- **WHEN** a session has two saved text turns
- **THEN** `show <id>` prints the header and the two turns

#### Scenario: show --full reads the transcript file

- **WHEN** the session's transcript has a tool call and a tool result
- **THEN** `show <id> --full` prints the text turns, the call and the result from the file

#### Scenario: show --full says so when the file is gone

- **WHEN** the transcript file was deleted and `show <id> --full` runs
- **THEN** it exits `missing` naming the path, and `show <id>` still prints the saved text

#### Scenario: show --full of a packed session names its archive

- **WHEN** `pack` moved the session and `show <id> --full` runs
- **THEN** it exits `missing` naming the archive and the `tar --zstd -xmf` command for its entries

#### Scenario: a window past the end says so

- **WHEN** a session whose last turn is #10 and `show <id> --lines 20-30` runs
- **THEN** it answers `no turns in 20-30; the last turn is #10`

#### Scenario: a long session stops at the character budget

- **WHEN** a session has 46 turns of 3 000 characters each and `show <id>` runs
- **THEN** it prints turns 1 to 6 and ends with `next: --lines 7-46`

### Requirement: Hooks save at the end and brief at the start

The plugin SHALL ship one hooks module, `hooks/register.tsx`, with function hooks that call its own
`$.memory` noun and hold no rule of their own. `session.end` and `session.start` SHALL run
`save --catch-up --detach`, which saves the ending session too, and `session.start` SHALL also run
`pack --detach`, which decides itself whether a pack is due. The first `prompt.submit` of a
session, and the first after a `/clear` or a compaction, SHALL run `orient --cwd <cwd>` and attach
its text as hidden `context` on `prompt.submit`, never on a `classic.*` event, `prompt.section` or
`prompt.compose`. A compaction is read on `prompt.submit` from `$.session.messages()`: the newest
row that opens `This session is being continued from a previous conversation` is a compaction
summary, and a summary other than the one the last briefing followed means the briefing is owed
again. The hook SHALL NOT use `session.compact` or a `session.append` notice, because an
organization's policy plugin that runs first can pass `session.compact` over and never delivers the
`compact_boundary` notice to a plugin. `save --detach` and `pack --detach` SHALL start the same
verb in a detached `qsm-memory` process and return at once, the child's outcome appended to
`save.log` beside the archive, every line led by an ISO timestamp (`--log`, which stamps no other
verb), so the 1.5 s the engine gives the session-end chain covers only the start. No hook SHALL
block the event: any failure SHALL be toasted as `qsm-memory ERROR: <event>: <reason>` and the
event goes on; a failed save leaves the transcript for the next start.

#### Scenario: session end saves the transcript

- **WHEN** `save --catch-up --detach` runs, as the `session.end` hook runs it
- **THEN** it answers ok at once and the detached save puts the session in the archive

#### Scenario: session start runs the pack in the background

- **WHEN** a session starts and a pack is due
- **THEN** the hook returns at once and `save.log` gains a timestamped line naming the archive and
  how many sessions moved

#### Scenario: the first prompt carries the briefing

- **WHEN** the first prompt of a session is submitted
- **THEN** its `context` is the text `orient --cwd <cwd>` answered, once, and the next prompt
  carries none

#### Scenario: the first prompt after a compaction carries the briefing again

- **WHEN** a `/compact` or an automatic compaction runs and the next prompt is submitted
- **THEN** its `context` is the text `orient --cwd <cwd>` answered, once, and a second compaction
  brings it back once more

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
`notes`, `orient`, `doctor`, `pack`, `blob path`, `blob put`, and `mcp`, each answering with the
marketplace's outcome envelope under `--json` (`{ code, exit, reason, message, warnings, data }`).
`qsm-memory mcp` SHALL serve `search`, `show`, `list`, `notes`, and `note` as MCP tools over stdio,
backed by the same functions the verbs call. The binary SHALL know no harness: it reads its
arguments, `QSM_MEMORY_DB`, `XDG_DATA_HOME`, and `CLAUDE_CONFIG_DIR` for the transcript directory
and the live-session files, and nothing else of the process that runs it. `doctor` is the health
probe every marketplace binary carries: the archive path, how many sessions and notes it holds, how
many main transcripts on disk it lacks, and `failed` when the archive does not open.

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
`save`, `search`, `show`, `list`, `note`, `notes`, `orient`, `doctor`, `pack`, each running the
binary with `--json` and returning its envelope. `types/index.d.ts` is committed and regenerated by
`lib/generate-noun.ts`.

#### Scenario: Another plugin searches

- **WHEN** a dependent plugin's hooks module calls `$.memory.search("gate red")`
- **THEN** it typechecks against the generated contract and receives the `search` envelope

### Requirement: Activation turns the harness's own memory off, by choice

`qsm-setup activate qsm-memory -- --memory <qsm|claude>` SHALL run `scripts/activate.ts` and record
the choice in the archive's `state` table as `retention`. With `qsm` it SHALL set
`autoMemoryEnabled` to `false` and `cleanupPeriodDays` to `36500` (unless the file already holds
that value or a higher one) in the Claude home's `settings.json`, leave every other key as it was,
and create the file when there is none, so Claude Code stops writing its own memory files and never
deletes a transcript; it SHALL record `activated_at` as now unless one is already recorded, so
activating again does not restart the pack's 30-day grace. A lower value is raised, never kept:
Claude Code's default of 30 days deleted every transcript older than a month on this machine before
the archive existed, and a 7-day value this plugin once set deleted two weeks of them the day after;
a transcript is the person's, holds what `show --full` reads (tool calls, results), and never comes
back. Nothing in qsm SHALL ever write a value below 36500. With `claude` it SHALL write nothing to
`settings.json`, so Claude Code's own retention applies by the person's choice, and the pack never
runs. A `settings.json` that does not parse SHALL be an error naming the file, and the file SHALL
be left as it was. Install SHALL never run it. The MCP connection is not a step: the plugin's
`.mcp.json` registers `qsm-memory mcp` when the plugin is enabled.

#### Scenario: qsm turns the harness memory off and keeps every other key

- **WHEN** the activation runs with `--memory qsm` and `settings.json` holds other keys
- **THEN** `autoMemoryEnabled` is `false`, `cleanupPeriodDays` is `36500`, the other keys are
  unchanged, `retention` is `qsm` with `activated_at` now, and the step is `installed`

#### Scenario: qsm raises a deleting cleanupPeriodDays

- **WHEN** `settings.json` holds `cleanupPeriodDays: 3`
- **THEN** it becomes `36500` and `autoMemoryEnabled` is `false`

#### Scenario: qsm leaves a longer retention alone

- **WHEN** `settings.json` holds `cleanupPeriodDays: 99999`
- **THEN** it stays `99999` and `autoMemoryEnabled` is `false`

#### Scenario: running it again with nothing changed is already

- **WHEN** the activation runs with `--memory qsm`, both keys already hold those values and the
  choice is recorded
- **THEN** nothing is written, `activated_at` is unchanged, and the step is `already`

#### Scenario: claude records the choice and leaves settings.json alone

- **WHEN** the activation runs with `--memory claude` and `settings.json` holds
  `cleanupPeriodDays: 30`
- **THEN** `settings.json` is byte-for-byte as it was and `retention` is `claude`

#### Scenario: settings.json that does not parse is an error naming the file

- **WHEN** the activation runs with `--memory qsm` and `settings.json` is not JSON
- **THEN** the step is `error`, names the file, and the file is byte-for-byte as it was

### Requirement: Retention is checked wherever qsm reads the settings, and a deletion is failed

`cleanupPeriodDays` is the one setting through which Claude Code deletes what the person typed, so
`doctor` SHALL read it together with the recorded retention choice. Under `qsm`, or with no choice
recorded, it SHALL answer `failed` (never a warning) when the value is absent (Claude Code then
deletes after 30 days) or below 36500, naming the file, the value in force, and the activation that
fixes it; `ok` otherwise, naming the value. Under `claude` it SHALL answer `ok` naming the days in
force and that they are the person's choice. The `session.start` hook SHALL call `doctor` after
its catch-up save, so a deleting retention nobody chose is toasted at every session start until it
is fixed. A `settings.json` that does not parse, or whose `cleanupPeriodDays` is not a number, is
`failed` under any choice, naming the value: an unknown retention is not a kept one. The `failed`
outcome carries the days in force as its data, and the retention sentence comes first in the
doctor's message, so a toast that cuts the message short still shows the fix.

#### Scenario: a deleting retention fails the doctor and the session start

- **WHEN** no choice or `qsm` is recorded and `settings.json` holds `cleanupPeriodDays: 30`, or no
  such key
- **THEN** `doctor` is `failed` naming `settings.json`, the days in force and
  `qsm-setup activate qsm-memory -- --memory qsm`, and a session start toasts that message

#### Scenario: a kept retention is ok

- **WHEN** `settings.json` holds `cleanupPeriodDays: 36500`
- **THEN** `doctor` is `ok` and says transcripts are kept

#### Scenario: Claude Code's retention by choice is ok

- **WHEN** `claude` is recorded and `settings.json` holds no `cleanupPeriodDays`
- **THEN** `doctor` is `ok` and says Claude Code deletes after 30 days by the person's choice
