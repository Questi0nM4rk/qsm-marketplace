# Usage

`qsm-memory <verb> [args]`; `--help` lists options. Verbs: `save`, `search`, `show`, `list`,
`note`, `notes`, `orient`, `doctor`, `mcp`.

```bash
qsm-memory search "words" --since 7d
qsm-memory show <session-id-prefix> --full
qsm-memory note "text" --expires 14
```

- `--json` on any verb prints one envelope: `{ code, exit, reason, message, warnings, data }`.
- Exit codes: `ok` 0, `usage` 2, `missing` 4 (nothing found), `blocked` 5 (note text looks like a
  secret).
- Notes are per project (shared by all worktrees), expire in 14 days unless `--expires <N>` (days),
  `--keep` or `--global`.
- `save --detach` starts the save in a detached `qsm-memory` process and returns at once; the
  outcome is appended to `save.log` beside the archive, every line led by an ISO timestamp
  (`save --log`). A transcript catch-up cannot save is named, the rest still save: the outcome
  is `partial` and lists it.
- `list` prints at most `--limit` lines (default 20) and ends with `N more: --limit <M>` when
  there are others; `--since` takes `Nd` or a date and is a usage error otherwise.
- `show <id>` prints the saved text; `--full` reads the transcript file instead (tool calls and
  results too, numbered by position in the file) and fails as `missing` when the file is gone.
- `orient [--cwd <dir>]` answers the session-start block, at most 1500 characters, as `{ text }`:
  the project's last three sessions, the in-progress tasks with their epics, the notes, how to
  search.
- Hooks (function hooks in `hooks/register.tsx`): `session.end` and `session.start`
  run `save --catch-up --detach`; the first prompt of a session, and the first after a `/clear` or
  a compaction, carries `orient --cwd <cwd>` as hidden context. None blocks;
  a failure is a toast `qsm-memory ERROR: <event>: <reason>` and a log line.
- `memory` (skill, `qsm-memory:memory`) fires at session start, before asking something an earlier
  session may have settled, and at a handoff: search first, act on the hit, write one note.
- `recall` (agent, `qsm-memory:recall`, haiku) takes a question about earlier sessions and answers
  in a few lines, every claim cited as `<session-id> #<turn> <date>`; check one with
  `show <id> --lines a-b`.
- Environment: `QSM_MEMORY_DB` (archive file), `CLAUDE_CONFIG_DIR` (where transcripts live).
