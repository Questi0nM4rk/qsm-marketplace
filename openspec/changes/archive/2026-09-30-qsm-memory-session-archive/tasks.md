## 1. Archive store and save

- [x] 1.1 `plugins/qsm-memory/lib/store.ts`: one database at `$XDG_DATA_HOME/qsm-memory/memory.db`
  (`QSM_MEMORY_DB` override), 0600, WAL, busy timeout; tables `sessions`, `turns`, `turns_fts`
  (two columns: text and tools, results), `notes`; the old `memories`/`relations` schema, scope
  walk and `init` deleted. Tests: creation with permissions, override path, FTS triggers.
- [x] 1.2 `plugins/qsm-memory/lib/transcript.ts`: the record walk carried over from `lib/digest.ts`
  (then deleted): keep `user`/`assistant`, blocks `text`/`tool_use`/`tool_result`, human-turn
  detection, `ai-title` title with first-turn fallback, project key from the git common dir,
  malformed last line skipped. Fixture transcripts under `lib/fixtures/` covering every record
  type seen on 2026-09-30 (`attachment`, `ai-title`, `last-prompt`, `queue-operation`, `mode`).
  Tests: the "saves as text, tool calls and tool results and nothing else" and "no human turn"
  scenarios.
- [x] 1.3 `plugins/qsm-memory/lib/save.ts` + verb: idempotent upsert by turn uuid, subagent kind
  and parent, `--catch-up` over `$CLAUDE_CONFIG_DIR/projects` with the twenty cap and the remain
  count. Tests: resumed session, subagent, catch-up cap, mtime re-save.

## 2. Read verbs

- [x] 2.1 `lib/search.ts` + verb: FTS query builder (prefix, stopwords, carried from `recall.ts`),
  BM25 + recency, session grouping, hit line and snippet, `--results`, `--agents`, `--project`,
  `--since`, `--limit`, `no session matches`. Tests: the four search scenarios plus a fixture set
  of three sessions and ten questions with a hit in the top five for each.
- [x] 2.2 `lib/show.ts` + verb: three depths, `--lines`, the 200-turn window and `next:` pointer,
  id prefix. Tests: the three show scenarios.
- [x] 2.3 `lib/list.ts` + verb: one line per session, `--since`, `--project`, `--agents`,
  `--unsaved`. Tests: the list scenario and `--unsaved`.

## 3. Notes

- [x] 3.1 `lib/notes.ts` rewritten + `note`/`notes` verbs: project key, `--global`, `--expires`,
  `--keep`, `--drop`, purge on read, secret refusal via `secret-shapes.ts`; `yaml` dependency and
  the markdown notes deleted. Tests: the four notes scenarios.

## 4. Binary surface

- [x] 4.1 `qsm.json`: verbs `save`, `search`, `show`, `list`, `note`, `notes`, `mcp` with
  descriptions; the fourteen old verbs removed; `bun lib/generate-noun.ts` regenerates
  `types/index.d.ts` and `hooks/noun.generated.ts`; `scripts/cli.ts` wires the handlers;
  `scripts/*-verbs.ts` for the old verbs deleted. Tests: `cli.test.ts` help and `--json` envelope
  per verb.
- [x] 4.2 `lib/mcp.ts`: five tools (`search`, `show`, `list`, `notes`, `note`), each under 30
  lines (closes qsm-yosp.4.1 by construction). Tests: `tools/list` names exactly five; the
  marketplace spec scenario "A client connects to the memory server" still passes.
- [x] 4.3 `scripts/activate.ts`: `cleanupPeriodDays` 7 unless lower, beside `autoMemoryEnabled`.
  Tests: the two new activation scenarios added to `activate.test.ts`.

## 5. Hooks

- [x] 5.1 `hooks/session-end.ts` runs `save <transcript_path>`; `hooks/session-start.ts` runs
  `save --catch-up` then prints `notes` as `additionalContext` with the one orienting line;
  `hooks/hooks.json` loses `modules`, gains the comment naming why both are classic;
  `hooks/register.tsx`, `register.test.ts`, `stage-output.ts`, `agents/memory-curator.md` deleted.
  Tests: `session-end.test.ts` and `session-start.test.ts` spawn the built binaries on stdin for
  the three hook scenarios. `.gates/test-hooks.test.ts` fixture line for qsm-memory updated.
- [x] 5.2 `scripts/install.ts` compiles the two hooks and the binary as today; `bun run validate`,
  `lint`, `typecheck`, `test`, `test:hooks` green; `claude plugin validate plugins/qsm-memory`.

## 6. Documents and dependents

- [x] 6.1 `plugins/qsm-memory/openspec/specs/qsm-memory/spec.md` purpose rewritten; `INTENT.md`
  rewritten whole (five sentences: transcripts are the memory, notes are the only write, per
  machine, never deleted, when it would have no reason to exist); `README.md`, `INSTALL.md`,
  `USAGE.md` for the seven verbs and two hooks.
- [x] 6.2 `plugins/qsm-essentials`: `scripts/activate.ts` and `activate.test.ts` lose the
  memory-rules symlink; `skills/memory/SKILL.md` shrinks to the four rules and the verb table;
  `agents/implementer.md` handoff line uses `note`; `instructions/CLAUDE.md` rows ("the memory
  tool", LOAD, LEARN, CONSOLIDATE, CLOSE) and the "architecture decision is a verified memory"
  sentence say: a decision's reason lives in the spec's design or the commit; spec requirement
  removed.
- [x] 6.3 Dependents: `plugins/qsm-usage/skills/memory-rules/` deleted and its `usage` skill list
  and spec table updated; `plugins/qsm-toolbox/lib/catalog.ts` row reach text and toolbox spec
  line; `plugins/qsm-plan/skills/{plan,wayfinder}/SKILL.md`, `plugins/qsm-plan/README.md`,
  `plugins/qsm-builder/skills/add-plugin/SKILL.md`, `plugins/qsm-setup/skills/setup/SKILL.md`
  memory question wording; `plugins/qsm-essentials/skills/debugging/SKILL.md` mention. Grep for
  `recall`, `remember`, `handoff`, `promote`, `rules.md` across `plugins/` and `lib/` returns
  nothing about memory.

## 7. Machine migration and close

- [x] 7.1 On this machine: `qsm-setup install qsm-memory`, `qsm-setup activate qsm-memory --
  --memory qsm`, first `save --catch-up` runs until `list --unsaved` is empty. The old stores are
  already gone and the user rules already live in `~/.claude/rules/working-rules.md`.
- [x] 7.2 Close qsm-b1cs, qsm-pfq4.2, qsm-pfq4.3, qsm-pfq4.4, qsm-pfq4.6, qsm-f0k9, qsm-yosp.4.1,
  qsm-yosp.3.63 as obsolete with this change's id in the reason; spec-sync and spec-archive.

## Deviations

- `doctor` verb kept: the generated gate requires every marketplace binary to carry one for
  `qsm-setup doctor`; it reports the archive path, counts, and unsaved transcripts (spec, design
  and proposal updated).
- A `skipped` table remembers transcripts judged empty, so catch-up does not parse them every
  start (found on the first real catch-up: 28 of 323 files; internal, no verb changes).
- Scenario pairing: `qsm-openspec scenarios` reads `.feature` files only and the marketplace has
  none; every scenario title here is carried by a `bun test` title instead. Task qsm-unwq.
