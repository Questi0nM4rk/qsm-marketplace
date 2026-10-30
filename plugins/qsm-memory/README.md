# qsm-memory

A per-machine archive of your Claude Code sessions that the agent and you can search, with short
notes that carry work to the next session.

## Why it exists

Claude Code's own memory keeps a model-written summary of what mattered and throws the sessions
themselves away within weeks, so the only true record of what was tried, what failed and why a
decision went the way it did is gone, and the summary drifts from the session it came from.
qsm-memory replaces that default: the sessions stay on the machine they happened on, stripped to
what was said and searchable in one place, because the transcript is the memory and anything
distilled from it is a copy. It takes the stance that no agent writes long-term memory: a rule
belongs in the instruction file that loads it, unfinished work in the task tool, and the one thing
worth writing by hand is a short note for the next session that expires. It refuses to be a
knowledge base, a shared store, or a place where facts are graded and promoted. When the harness
keeps every transcript for good and searches them itself, this plugin has no reason to exist.

## What you get

| Kind  | Name                           | What it does                                                                                                                         |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Skill | `memory`                       | Search the archive before asking you again, act on the hit, write one note at a handoff.                                             |
| Agent | `recall`                       | Answers one question about earlier sessions, every claim cited as `<session-id> #<turn> <date>`.                                     |
| Hook  | `session.start`, `session.end` | Save main sessions the archive lacks, in a background process; `session.start` also runs `pack`.                                     |
| Hook  | `prompt.submit`                | Give the first prompt of a session, the first after a compaction, and the first after /clear, a briefing of at most 1500 characters. |
| MCP   | `qsm-memory`                   | `search`, `show`, `list`, `notes` and `note` as tools.                                                                               |
| CLI   | `qsm-memory`                   | 10 verbs, see [USAGE.md](USAGE.md).                                                                                                  |

## Install

```bash
claude plugin install qsm-memory@qsm-marketplace
bun plugins/qsm-memory/scripts/install.ts
```

Install compiles `qsm-memory` and links it into `$QSM_BIN_DIR` (default `~/.local/bin`). The hooks
call it from there. Brings `qsm-tasks` with it: the briefing lists the work in progress from the
task tool. Details are in [INSTALL.md](INSTALL.md).

## Use

Ask the agent: "did we already try the semgrep pre-push hook?" The skill searches the archive first.

```bash
qsm-memory list --since 7d
qsm-memory search "semgrep pre-push"
qsm-memory show 2009f5dd            # the saved text
qsm-memory show 2009f5dd --full     # the transcript file: tool calls and results too
qsm-memory note "qsm-abc: gate red on typecheck, fix first"
qsm-memory orient                   # the session-start briefing
```

Every verb takes `--json`. A note expires in 14 days unless you pass `--keep`.

## Caveats

- The archive is `~/.local/share/qsm-memory/memory.db` (override with `QSM_MEMORY_DB`), owner-only.
  It holds what you typed: never sync it.
- Claude Code deletes its transcripts after `cleanupPeriodDays`, 30 by default, and a deleted
  transcript never comes back: `show --full` (tool calls and results) and `--resume` need it.
  `qsm-setup activate qsm-memory -- --memory qsm` sets `autoMemoryEnabled: false` and
  `cleanupPeriodDays: 36500` in `~/.claude/settings.json`, raising any lower value; `doctor` and
  every session start report a deleting value as failed until it is fixed.
- Under `--memory qsm`, `pack` moves transcripts nobody has used for 7 days of use (a day on which a
  session started, so a break never ages one) into `transcripts/<date>.tar.zst`
  (`<date>-<n>.tar.zst` when that exists) beside the archive, at most once in 30 days and never in
  the first 30 days after activation. Each original is removed only after the archive is tested and
  listed. `show --full` of a packed session names the archive and the restore:
  `tar --zstd -xmf <archive> -C ~/.claude <entries>`, which also makes the files fresh, so they are
  not packed again at once. Needs `tar` and `zstd` on `PATH`. `--memory claude` leaves Claude Code's
  own retention in force and packs nothing.
- The hooks save in a background process. What it did, or why it failed, is appended to `save.log`
  beside the archive, each line with its date and time.
- A subagent transcript, and a session in which nobody typed a prompt, is not saved. The first
  start after install saves at most twenty old transcripts. `qsm-memory list --unsaved` shows the
  rest. `list` prints at most 20 lines unless you pass `--limit`.
- A project with a task tracker and no task tool on `PATH` fails the briefing as `missing`.
