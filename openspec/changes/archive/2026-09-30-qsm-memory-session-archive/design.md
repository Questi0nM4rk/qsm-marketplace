## Context

qsm-memory today is a claims store: one-sentence facts with a status, a source and a quote, a
recall ranked by BM25 and boosts, a promotion ladder into `rules.md`, and a two-stage capture that
turns a session digest into claims through a cheap model and a curator subagent. Every claim came
from a session, and the session digests already sat beside them. On 2026-09-28 a review deleted
23 of 49 verified rows as copies of a skill, an instruction file, or the tree, and found that the
doctor's drift list depends on the working directory the command runs from.

The decision (user, 2026-09-30): the transcripts are the long-term memory. What is shared across
machines is specs, tasks, docs and tool feedback, never memory. An agent writes nothing durable;
the one writable thing is a short-lived note for the next session, because compaction loses the
"this does not work right now, do it that way" that a session end knows.

Facts measured on this machine, 62 transcripts from 7 days, 62.5 MB:

| Bytes | Share | Kept |
| ------- | ------- | ------ |
| text turns | 2 % | yes, indexed |
| tool_use input | 4 % | yes, indexed |
| tool_result | 5 % | yes, own column, matched on request |
| other record types (attachment, ai-title, last-prompt, queue-operation, mode, ...) | 47 % | no |
| JSON envelope (uuid, usage, ids) | 42 % | no |

Claude Code deletes its transcripts after `cleanupPeriodDays` (default 30) and loads them for
`--resume`; that, not the digests (584 KB for 38 sessions), was the memory the user saw grow.

## Goals / Non-Goals

**Goals:**

- Every session with a human turn on this machine is findable and readable after Claude Code has
  deleted its transcript, forever, from one place.
- "What did we do last week" and "how did we fix X" are one `list` or one `search` away, by
  fuzzy full text, with no model call.
- The next session reads the handoff and the current warnings at start without a file to edit.
- An agent has no way to write long-term memory.

**Non-Goals:**

- Sharing the archive between machines. Per machine, never synced.
- Redacting secrets from tool results. That is qsm-secrets' change; the archive holds what the
  transcript held.
- A summary or a claim per session written by a model. `list` shows the transcript's own title.
- Compression, retention, or deletion of the archive.
- Migrating the old claims. The rows worth keeping were already deleted or moved to instruction
  files on 2026-09-28.

## Decisions

**One SQLite database under XDG data, not `.memory/` beside the project.**
`$XDG_DATA_HOME/qsm-memory/memory.db`, default `~/.local/share/qsm-memory/memory.db`,
`QSM_MEMORY_DB` overrides for tests. It is machine data nobody syncs, and one file answers a
question across projects. Alternative: one store per project as today; rejected because "last
week" spans projects and the per-project split was only there for sharing, which is gone.
Created with mode 0600, WAL journal, `busy_timeout` 5 s: two sessions ending together both write.

**Tables: `sessions`, `turns`, `turns_fts`, `notes`.**

- `sessions(id, kind text|agent, parent_id, cwd, project, title, started_at, ended_at,
  transcript_path, saved_at, turn_count)`.
- `turns(session_id, seq, uuid unique, role user|assistant, kind text|tool_use|tool_result,
  ts, tool, text)`: `text` holds the text, the tool input as compact JSON, or the result text.
- `turns_fts` (FTS5, `porter unicode61 remove_diacritics 2`, external content) over
  `text_and_tools` and `results` as two columns, so `--results` is a column filter, not a second
  index. Triggers keep it in step, as today.
- `notes(id, project null for global, text, created_at, expires_at null for keep)`.

**`save` is idempotent by turn uuid.** `--resume` appends to the same transcript file, so a
session is not immutable. Save upserts the session row, inserts turns whose uuid is new, updates
`ended_at`, `turn_count`, `saved_at`. Catch-up re-saves any transcript whose mtime is newer than
`saved_at`. Alternative: save once and treat later writes as a new session; rejected because the
session id is the same and the tail would be lost.

**Junk is dropped by record type and block type, no heuristics.** Kept record types: `user`,
`assistant`. Kept blocks: `text`, `tool_use` (name + input), `tool_result` (content text). A
`user` record whose content is only `tool_result` blocks is a result, not a human turn. A session
with zero human text turns is skipped and the reason is named. Title: the last `ai-title` record's
`aiTitle`, else the first human turn cut at 80 characters. The record walk in `lib/digest.ts`
already does most of this and is the one piece of code carried over.

**Subagent transcripts are saved and filtered, not skipped.** `<session>/subagents/*.jsonl`
saves as `kind = agent` with `parent_id`; `search` and `list` leave agents out unless `--agents`.
They hold the implementer's actual work, which is the "full context" the archive is for, and the
filter keeps them from drowning the main sessions.

**Project key is the main checkout root.** For a git working directory, the parent of
`git rev-parse --git-common-dir`, so every worktree of a repository shares its notes and groups
its sessions; outside git, the working directory itself. Alternative: exact cwd; rejected because
a note "X does not work" is about the repository.

**Search ranks BM25 plus recency, groups by session, prints turn-level hits.** Query terms become
`term*` prefix matches OR'd, stopwords dropped, as today's `recall` does. A hit line is
`<date> <project> <session-id> #<seq> <title>` and a one-line snippet. Ten hits default. No match
prints `no session matches` and nothing else.

**Notes expire, never promote.** Default 14 days, `--keep` for none, `--drop <id>` to remove,
expired rows purged on every read. A handoff is a note that starts with the task id; no separate
verb. Secret-shaped text is refused with `secret`, reusing `lib/secret-shapes.ts`.

**Both hooks stay classic command hooks.** SessionEnd runs `save <transcript_path>` (20 s).
SessionStart runs `save --catch-up` and then prints `notes` for the working directory as
`additionalContext` (10 s). The reason, in the hooks.json comment as AGENTS.md asks: neither event
needs the engine's function surface (no hold, no rewrite, no UI), and the dialog that justified
`register.tsx` is gone. Catch-up saves at most 20 transcripts per start and names the rest, so a
first run over 500 MB does not hold the prompt.

**`--memory qsm` writes two keys.** `autoMemoryEnabled: false` as today, and `cleanupPeriodDays`
set to 7 unless it is already lower. A week is the margin for a machine left off; save at
SessionEnd and catch-up at SessionStart make the loss of a transcript before save unlikely.

**`doctor` is the marketplace's health probe, not a drift checker.** Every qsm binary carries a
`doctor` verb for `qsm-setup doctor` (the generated gate enforces it); here it reports the archive
path, the counts, and the transcripts on disk not yet saved, and `failed` when the archive does
not open. Nothing else in the archive can drift, because nothing in it claims anything. A failed
save toasts `qsm-memory ERROR: save: <reason>` and leaves the transcript for the next start. A
transcript judged empty (no human turn) is remembered in a `skipped` table with its mtime, so
catch-up does not parse it again every start.

## Risks / Trade-offs

- [The transcript title is missing or vague, and `list` reads like noise] → the first human turn
  is the fallback, and `search` does not depend on titles. Ceiling: a one-line summary per session
  is the next step if `list` proves too coarse, still no claims table.
- [tool results hold secrets, kept for good] → per machine, 0600, never shared; the transcript
  held the same bytes for 30 days already. Redaction is qsm-secrets' change.
- [A parallel live session's transcript is caught up mid-write] → save is idempotent and the
  session's own SessionEnd saves the tail; a half-read last line is skipped as malformed JSON.
- [`cleanupPeriodDays: 7` removes `--resume` for older sessions] → accepted by the user; `show`
  gives the content.
- [First catch-up over 500 MB of transcripts is slow] → capped at 20 per start; the rest follow
  on the next starts and `list --unsaved` shows the queue.

## Migration Plan

1. Land the plugin: new verbs, hooks, activation, docs, `$.memory` noun regenerated. Run
   `qsm-setup install qsm-memory` and `qsm-setup activate qsm-memory -- --memory qsm`.
2. First `qsm-setup activate` and the next SessionStart save what Claude Code still holds.
3. Done by hand on 2026-09-30: the 12 user rules live in `~/.claude/rules/working-rules.md`,
   `~/.memory/` and the one project `.memory/` are deleted, no symlink existed.
4. Close the obsolete tasks named in the proposal at archive.

Rollback: the old plugin is one commit back on the branch; the archive database is separate from
the old stores and can be deleted without touching anything else.

## Open Questions

None. The frontier emptied on 2026-09-30 (ten decisions, all with the recommended answer).
