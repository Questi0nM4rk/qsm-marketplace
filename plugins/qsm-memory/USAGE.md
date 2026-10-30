# Usage

`qsm-memory <verb> [args]`; `--help` lists options. Verbs: `save`, `search`, `show`, `list`,
`blob put`, `blob path`, `note`, `notes`, `orient`, `doctor`, `pack`, `mcp`.

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
- `pack` moves the transcripts nobody has used for 7 days of use (a local date on which a session
  started, plus today; a break adds nothing) into `transcripts/<YYYY-MM-DD>.tar.zst` beside the
  archive, each original removed only after `zstd -t` and a listing of the archive agree. It runs
  only under `--memory qsm`, 30 days after activation and 30 days after the last pack; otherwise
  it answers `ok` naming the first unmet condition and moves nothing. An unsaved or a live
  transcript stays. `pack` fails `missing` without `tar` or `zstd`, and `partial` names a file
  that changed while packing. `--detach` and `--log` work as for `save`. Restore:
  `tar --zstd -xmf <archive> -C <claude home> <entries>`, as `show --full` prints it.
- `--memory <qsm|claude>` of the activation records the choice; under `claude` `doctor` reports a
  deleting `cleanupPeriodDays` as the person's, ok, and nothing is packed.
- `list` prints at most `--limit` lines (default 20) and ends with `N more: --limit <M>` when
  there are others; `--since` takes `Nd` or a date and is a usage error otherwise.
- `show <id>` prints the saved text; `--full` reads the transcript file instead (tool calls and
  results too, numbered by position in the file) and fails as `missing` when the file is gone.
- `blob put <file>` stores the bytes under their sha256 in `blobs/` beside the archive and prints
  `<sha256>  <path>`; the same bytes again store nothing. `blob path <sha256>` prints the path, or
  fails as `missing`.
- `save` also copies each image pasted into a typed prompt into `blobs/` and records it in the
  archive's `blob_ref` table (session, turn, sha256, media type); files and links a prompt names
  are not kept.
- `orient [--cwd <dir>]` answers the session-start block, at most 1500 characters, as `{ text }`:
  the project's last three sessions, the in-progress tasks with their epics, the notes, how to
  search.
- Hooks (function hooks in `hooks/register.tsx`): `session.end` and `session.start`
  run `save --catch-up --detach`, and `session.start` also `pack --detach`; the first prompt of a
  session, and the first after a `/clear` or a compaction, carries `orient --cwd <cwd>` as hidden
  context. None blocks; a failure is a toast `qsm-memory ERROR: <event>: <reason>` and a log line.
- `memory` (skill, `qsm-memory:memory`) fires at session start, before asking something an earlier
  session may have settled, and at a handoff: search first, act on the hit, write one note.
- `recall` (agent, `qsm-memory:recall`, haiku) takes a question about earlier sessions and answers
  in a few lines, every claim cited as `<session-id> #<turn> <date>`; check one with
  `show <id> --lines a-b`.
- Environment: `QSM_MEMORY_DB` (archive file, and `blobs/` beside it), `CLAUDE_CONFIG_DIR` (where
  transcripts live).
- Screenshot eval (in the checkout, not the binary):
  `QSM_MEMORY_OCR_FIXTURES=<dir> bun evals/ocr/run.ts --model haiku --runs 3` reads Teams
  screenshots into JSON with `evals/ocr/guide.md` and scores each run against gold with
  `evals/ocr/score.ts`. The fixtures are private: `threads.json` lists each thread's screenshots as
  blob sha256, beside `gold/` and `runs/`.
