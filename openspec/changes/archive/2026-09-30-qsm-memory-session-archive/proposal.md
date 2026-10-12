## Why

Memory as distilled claims duplicated what the session transcripts already hold, and grew an
apparatus (candidate and verified statuses, quotes, supersede, doctor drift, promote, curator) to
guard the copy: on 2026-09-28 a review found 23 of 49 verified rows restating a skill, an
instruction file, or the tree, and the doctor's drift list changed with the working directory
(qsm-b1cs). The transcripts are the long-term memory. What a session needs from the past is to
find the session and read it, plus a handful of short-lived notes for the next session; nothing
else is worth an agent's write. Now, because the rewrite branch is about to merge and qsm-memory
is the one plugin whose shape the user rejected on review.

## What Changes

- **BREAKING** qsm-memory becomes a per-machine archive of Claude Code sessions. A SessionEnd
  hook saves the transcript into one SQLite database with the junk stripped: text turns, tool
  calls and tool results are kept, progress, attachment, title and queue records and the JSON
  envelope are dropped (94 % of the bytes on a 7-day sample). Nothing in the archive is ever
  deleted by the tool.
- **BREAKING** `remember`, `recall`, `promote`, `forget`, `inspect`, `rules`, `handoff`,
  `scratch`, `digest`, `stage-session`, `doctor`, `gc`, `eval`, `context`, `init` are removed,
  with the `memories` and `relations` tables, statuses, quotes, `rules.md`, the session digests,
  the curator agent, the dialog on `/clear`, and the stage-1 prompt. No agent writes long-term
  memory; a rule goes into the instruction file or skill it belongs to, feedback goes into a task.
- New verbs: `save <transcript>` (idempotent, re-run after `--resume` appends turns), `search
  <query>` (FTS5 over text and tool calls, whole machine by default, `--project`, `--since`,
  `--agents`, `--results`), `show <session> [--tools|--full] [--lines a-b]`, `list [--since]`
  (title, date, project per session), `note <text> [--expires 14d|--keep] [--global]`,
  `notes [--all]`, `note --drop <id>`, `doctor` (the marketplace's health probe: the archive
  opens, counts, transcripts still unsaved). `mcp` serves `search`, `show`, `list`, `notes`,
  `note`.
- Short-term notes are the one thing an agent may write: a handoff, "X does not work now, do
  Y", each with a from-date and an expiry, keyed by the repository's main checkout so worktrees
  share them. SessionStart injects the current notes for the working directory and saves any
  transcript the archive is missing (a crash, `/clear`, a parallel session).
- Subagent transcripts (`<session>/subagents/*.jsonl`) are saved, marked `agent`, linked to
  their parent, and left out of `search` unless `--agents` asks.
- The activation `--memory qsm` also sets `cleanupPeriodDays: 7`, so Claude Code deletes its own
  transcripts a week after the archive has them; `--resume` on an older session is the one loss.
- The essentials activation no longer links `~/.claude/rules/memory-rules.md`; the essentials
  `memory` skill shrinks to four rules (read notes at start, search before asking, write a note
  when handing over, write nothing else); the qsm-usage `memory-rules` skill is deleted; the
  toolbox catalog row, the implementer agent's handoff line, the plan and add-plugin skills, and
  the essentials `CLAUDE.md` rows (LEARN, CONSOLIDATE, CLOSE, "the memory tool") say the new thing.
- The existing `.memory/` stores on this machine are deleted; the transcripts Claude Code still
  holds (30 days, 502 MB) are saved by the first SessionStart. Older sessions are gone, accepted.

## Capabilities

### New Capabilities

None. The plugin keeps its name, binary, noun, and MCP server.

### Modified Capabilities

- `qsm-memory`: every requirement is replaced. Removed: the two-store walk, the four layers, the
  handoff and scratch notes as files, the memory row with status, source and quote, relations,
  supersede, recall ranking with boosts, promotion and rules, context assembly, staged capture
  with the two-stage curator, the dialog, doctor and gc, eval, the secret and scope refusals.
  Added: the archive database and where it lives, save from a transcript with the junk stripped
  and idempotent re-save, catch-up at session start, search, show, list, notes, the MCP tool set,
  the two hooks, and the activation writing two settings keys. Kept in substance: one binary
  with the same verbs over MCP and no harness inside, the `$.memory` noun from qsm.json.
- `qsm-essentials`: the requirement "The installer projects memory rules" is removed; there is
  no `rules.md` to project.
- `qsm-usage`: the topics table loses the `memory-rules` row; there are no memories to audit
  against rules.

## Impact

- `plugins/qsm-memory/`: `lib/` and `scripts/` rewritten (the transcript record walk in
  `lib/digest.ts` is the one piece carried over), `hooks/register.tsx` and its dialog deleted,
  `hooks/session-end.ts` and `hooks/session-start.ts` re-pointed at `save` and `notes`,
  `agents/memory-curator.md` deleted, `qsm.json` verbs replaced (noun and `types/index.d.ts`
  regenerate), spec, INTENT, README, INSTALL, USAGE rewritten whole.
- `plugins/qsm-essentials/`: `scripts/activate.ts` loses the symlink step and its tests,
  `skills/memory/SKILL.md` shrinks, `agents/implementer.md` handoff line, `instructions/CLAUDE.md`
  rows, spec requirement removed.
- `plugins/qsm-usage/skills/memory-rules/` deleted; `plugins/qsm-toolbox/lib/catalog.ts` row
  text; `plugins/qsm-plan/skills/{plan,wayfinder}/SKILL.md` and `plugins/qsm-builder/skills/
  add-plugin/SKILL.md` name search and notes instead of recall and remember;
  `.gates/test-hooks.test.ts` fixture line for qsm-memory's hooks.json.
- Dependencies: `@modelcontextprotocol/sdk` and `zod` stay; `yaml` leaves with the markdown
  notes. `bun:sqlite` FTS5 stays.
- Open tasks made obsolete and closed at archive: qsm-b1cs, qsm-pfq4.2, qsm-pfq4.3, qsm-pfq4.4,
  qsm-pfq4.6, qsm-f0k9, qsm-yosp.4.1, qsm-yosp.3.63.
- User data: `~/.memory/` and every project `.memory/` on this machine are deleted by hand after
  the first save has run; the 12 user rules written to `~/.memory/rules.md` on 2026-09-28 move
  to `~/.claude/rules/` first.

## Critiques

Devil's advocate:

- *A transcript is not a memory; the agent will not know which session to open.* `list --since`
  gives one line per session (title, date, project) and `search` hits carry the turn, so the
  agent finds the place, not the file. If that proves too coarse, a per-session summary line is
  the next thing to add, not a claims table. Waived, with that ceiling named in the design.
- *Tool results hold secrets and the archive keeps them for good.* The archive is per machine,
  0600, never shared; the transcript already held the same bytes for 30 days in `~/.claude`. The
  redaction that would make either safe is qsm-secrets' change, not this one. Waived.
- *`--resume` appends to a saved session; a one-shot save silently misses the tail.* Fixed:
  `save` is idempotent by turn uuid and catch-up re-saves any transcript newer than its saved-at.

Future archaeologist:

- *Why does the archive live under XDG data and not beside the project?* Because it is machine
  data nobody syncs, and one database answers "what did we do last week" across projects. In the
  design and the INTENT. Fixed.
- *Why 7 days for `cleanupPeriodDays`?* Save runs at SessionEnd and catch-up at every
  SessionStart; a week is the margin for a machine left off. Named in the design. Fixed.

Scope sniper:

- *A title per session from a model call.* Cut: Claude Code writes `ai-title` records into the
  transcript; the first user message is the fallback. Zero model calls in this plugin.
- *A `doctor` for the archive.* Cut: `list --unsaved` is the one health question (transcripts on
  disk not yet in the archive), and a failed save toasts its cause. Nothing else can drift.
- *Compression and retention policy.* Cut: 6 % of 3 GB a year is a few hundred megabytes; the
  archive is never deleted or compressed.
