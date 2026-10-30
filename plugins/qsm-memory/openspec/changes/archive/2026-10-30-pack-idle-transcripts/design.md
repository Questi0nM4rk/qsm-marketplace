## Context

qsm-memory keeps the text of every main session in `memory.db`, and in qsm mode sets
`cleanupPeriodDays: 36500` so Claude Code never deletes a transcript (`projects/<dir>/<id>.jsonl`
plus the session's `projects/<dir>/<id>/` directory: subagents, `tool-results/`). Measured on
2026-10-30: 186 MB of transcripts pack to 26 MB with `tar` and `zstd -19`, and to 24 MB with
`xz -9e`. Claude Code's own sweep counts calendar days since a file last changed and runs silently
after a session starts (code.claude.com/docs/en/settings-reference, `cleanupPeriodDays`). The
person settled the rule on 2026-10-30 (epic qsm-a0zj): age is counted in days of use, a pack runs
monthly and only while the person is working, and nothing is deleted without an archive. The
numbers in this design (7 days of use, 30 days of grace and cadence)
are the person's decisions, not measurements.

## Goals / Non-Goals

**Goals:**

- A transcript nobody uses any more ends up in a small archive, with one command to restore it.
- A break, with or without a session or two in it, never ages a transcript the person still wants.
- One rule, deterministic: the same archive, files and date give the same pack.

**Non-Goals:**

- No timer or systemd unit, no question to the agent or the person, no packing of `memory.db`, no
  `file-history/` or `plans/`, no unpack verb, no pack under the `claude` choice.

## Decisions

1. **A day of use is a local calendar date on which a saved main session started**, read from
   `sessions.started_at`, plus today when `pack` runs from a session start. Alternatives: Claude
   Code's `history.jsonl` (another tool's file, unversioned) or transcript mtimes (they move when a
   session is resumed, so they would count a day twice or lose one). The archive already holds the
   start of every session a person typed in, so no new data is collected.
2. **A transcript's age is the number of days of use after the local date of its mtime.** Out at
   7. A resumed session appends to its file, so its mtime moves and its age is 0 again, which is
   the person's "reopening makes it used".
3. **Whether a pack is due is one function of today**: the choice is `qsm`, and 30 days have passed
   since `activated_at` and since `last_pack_at` (when there is one). No separate activity gate: age
   in days of use already adds nothing for a break. Any condition false answers `ok` with the
   reason, never an error, because not packing is the safe state.
4. **What is never packed**, whatever its age: a transcript the archive has not saved since its
   last change (the set `unsavedTranscripts` already computes, reused), so no text is lost to
   search; and a live session, one whose id appears in a `~/.claude/sessions/<pid>.json` whose pid
   is alive (Claude Code documents that directory as one file per running session), because Claude
   Code would recreate a moved file with only the new lines.
5. **The archive** is `<data dir>/transcripts/<YYYY-MM-DD>.tar.zst`, the date of the run, beside
   `memory.db` and owner-only like it. Entries are relative to the Claude home
   (`projects/<dir>/<id>.jsonl`, `projects/<dir>/<id>/`), so restore is
   `tar --zstd -xmf <archive> -C <claude home> <entries>`; `-m` gives the restored file today's
   mtime, so it is not packed again by the next run. It is written as `<name>.part` with
   `tar -cf - … | zstd -19 -T0`, tested with `zstd -t`, listed with `tar -tf` and compared to the
   file list, renamed, and only then are the originals removed. `zstd` over `xz`: 8% larger here,
   but it decompresses several times faster, and a restore is the moment the person waits.
6. **State lives in `memory.db`**, a `state` table (`retention`, `activated_at`, `last_pack_at`) and
   a `packed` table (`session_id`, `archive`, `packed_at`, and `entries`, the paths archived for the
   session, so the restore command names only what the archive holds). The archive is the one
   per-machine store qsm-memory already owns; a second file would be a second owner. `last_pack_at`
   is claimed in one transaction before the run, so two session starts at once run one pack, and set
   back to its earlier value when the pack fails, so a failure is retried at the next start, not in
   30 days.
7. **Activation records the choice.** `--memory qsm` writes the settings as today and records
   `retention=qsm` and `activated_at` (kept when already set, so activating again does not restart
   the grace); `--memory claude` writes no setting and records `retention=claude`. The old `skip`
   value is removed, not aliased (one path). The retention check reads the recorded choice: under
   `claude` a deleting value is `ok` naming the days and the choice; under `qsm` or no choice it is
   `failed` as today.
8. **The hook starts `pack --detach`** beside `save --catch-up --detach` in `session.start`, the
   outcome appended to `save.log` with the save lines, so one log answers "what did qsm-memory do
   to my files".

## Risks / Trade-offs

- [A transcript changes while it is being packed] → it is compared by size and mtime to the moment
  it was listed; a changed file is left in place and named in the outcome (`partial`).
- [`tar` or `zstd` missing] → `pack` fails `missing` naming the tool; nothing is moved.
- [The `~/.claude/sessions/` shape changes] → reading it fails loud (`failed`, the file named) and
  the run moves nothing, because packing a live session is the one unsafe outcome.
- [The person restores a session only to read it] → `-m` makes it fresh, so it stays at least 7
  days of use; it is packed again later unless resumed. Accepted: reading is not using.
- [Days of use come only from saved sessions] → a session whose save failed does not count; it is
  saved at the next start's catch-up and counts from then, which delays a pack, never hastens one.

## Migration Plan

After the change lands, run `qsm-setup activate qsm-memory -- --memory qsm` once on this machine:
it records the choice, and the 30-day grace starts that day. Rollback is reverting the commit; the
archives are plain `tar.zst` files that restore without qsm-memory.
