## MODIFIED Requirements

### Requirement: A session starts with one short briefing

`qsm-memory orient [--cwd <dir>]` SHALL print one block of at most 1500 characters, built with no
model call and no network call, from the project of `cwd`: the last three saved sessions, each with
its date, title, count of user turns and what it left behind, then the project's current notes, and
one line on how to search (`qsm-memory search <words>`, then `qsm-memory show <id>`). What a session
left behind is read, not guessed: the commits on the branch checked out at `cwd` whose committer
date falls between the session's start and end (their count and the newest subject), from
`git log`; a session with none shows no outcome. A title alone says what a session was about, never
what it changed, so the next session would have to search to learn it. Outside a git repository the
commits SHALL be left out silently; a `git` that fails inside one SHALL fail the verb. The project
key of `cwd` follows the same rule: only "not a git repository" or a directory that is gone means
`cwd` itself; a `git` that is missing or refuses fails the verb. Notes SHALL take the room the other
lines leave, newest first, then a count of the older ones; under 100 characters of room they SHALL
be a count only. The block SHALL never exceed 1500 characters. With `--json` the block is
`data.text`.

#### Scenario: the block names sessions, notes and how to search

- **WHEN** a project has six saved sessions and a note
- **THEN** the block lists the three newest sessions, holds the note, and ends with the search line

#### Scenario: a session shows the commits of its window

- **WHEN** the branch at `cwd` holds two commits made during the newest session and one made
  before any listed session
- **THEN** the newest session's line says `2 commits` and quotes the newer subject, and no line
  counts the older commit

#### Scenario: a repository that once had a task file

- **WHEN** the project has a `.beads/` directory and no `br` on `PATH`
- **THEN** the block is built as for any project, with no task line and no error

#### Scenario: long titles and many notes still fit in 1500 characters

- **WHEN** six titles of 300 characters and twelve notes of 130 characters exist
- **THEN** the block is at most 1500 characters, holds the newest note, and ends with the search
  line

#### Scenario: a git that cannot run fails the briefing

- **WHEN** `git` is not on `PATH` while `orient` runs
- **THEN** it exits `failed` naming `git rev-parse`, and a `cwd` outside any repository or already
  removed is still its own project

## REMOVED Requirements

### Requirement: Dependencies

**Reason**: The only dependency, qsm-tasks, existed so `orient` could read tasks through `br`; the
briefing no longer reads tasks.

**Migration**: `qsm-tasks` leaves the `dependencies` array of `plugin.json`, whose array becomes
empty, and `lib/beads.ts` is deleted.
