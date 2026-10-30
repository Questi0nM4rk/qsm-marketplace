## Why

Claude Code deletes a transcript once it is older than `cleanupPeriodDays` in calendar days (default
30), as a silent sweep after a session starts, so a person who comes back after a month finds every
session gone; an older qsm-memory value of 7 did the same after one week, at the first start. qsm
mode already stops that (36500 days), but then nothing ever shrinks, and the person wants both:
nothing lost across a break, and transcripts nobody uses any more packed small while they work
every day (epic qsm-a0zj).

## What Changes

- A new verb `qsm-memory pack` moves the transcripts nobody has used for 7 days of use into one
  `zstd -19` archive beside the database, and removes each original only after the archive is
  checked. A day of use is a day on which a main session started; a day without Claude Code adds
  nothing, so a break never ages a transcript.
- `pack` runs at most once every 30 days, never in the first 30 days after activation, and only
  when at least 3 of the 5 days before today were days of use, so after a break the person has 3
  full working days to reopen what still matters.
- The `session.start` hook starts `pack` detached, beside the catch-up save. No timer.
- Activation records the person's choice in the archive: `qsm` (cleanupPeriodDays 36500 and the
  pack) or `claude` (Claude Code's own retention, qsm writes nothing). **BREAKING**: the
  `--memory skip` value is renamed `claude`, because it is now a recorded choice, not an absence.
- The retention check fails a deleting `cleanupPeriodDays` only when the recorded choice is `qsm` or
  there is none; under `claude` it reports the days in force as the person's choice.
- `show --full` of a packed session fails naming the archive and the one command that restores it.

## Capabilities

### New Capabilities

None: packing is part of what the archive keeps, so it lives in the `qsm-memory` spec.

### Modified Capabilities

- `qsm-memory`: adds the Pack requirement; changes Activation (two recorded modes), Retention
  (a deletion is failed only under qsm or no choice), Hooks (session start also starts the pack),
  Show (`--full` of a packed session), and the binary's verb list (`pack`).

## Impact

- `plugins/qsm-memory/lib/`: a new `pack.ts`, the store's schema (a state table and a packed
  table), `retention.ts`, `show` in `sessions.ts`.
- `plugins/qsm-memory/scripts/activate.ts`, `qsm.json` (the `pack` verb and its noun), the
  `session.start` hook in `hooks/register.tsx`, README, USAGE.
- Runtime tools: `tar` and `zstd` on PATH, needed only when a pack runs; a missing one is `missing`.
- On this machine, activation runs once more after the change lands, so the choice is recorded and
  the 30-day grace starts then.

## Critiques

- Devil's advocate: removing the originals is a tool deleting what the person made, which the
  marketplace refuses. Waived: the person decided it is a move, not a deletion ("we do not delete
  it, we just move it"), and the spec removes nothing before the archive is tested and its listing
  compared.
- Devil's advocate: mtime is a proxy for use; something other than a session could touch a
  transcript. Waived: a touch only resets the clock, which delays a pack and never hastens one.
- Devil's advocate: a session left open and idle in a pane would be packed while Claude Code still
  writes to it. Fixed: a live session (a `sessions/<pid>.json` with a running pid) is never taken.
- Devil's advocate: the gate counted today, so a return gave 2 days, not the 3 promised. Fixed: the
  gate counts the 5 dates before today.
- Future archaeologist: 7 days of use, 3 of 5 and 30 days look like measured values. Fixed: the
  design names them as the person's decisions of 2026-10-30.
- Scope sniper: the doctor's count of packed sessions was not asked for. Fixed: cut from the spec
  and tasks. Kept: the `packed` table (it is how `show --full` names the archive to restore from)
  and the claimed `last_pack_at` (sessions start in parallel here, 6 were live at once today).
