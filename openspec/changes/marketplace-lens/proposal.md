## Why

The person who owns this marketplace cannot see, in one place, what each plugin, skill and agent
is for, what it depends on, and what each eval checks and why: the answer is spread over
frontmatter, bodies, `case.yaml`, prompts and grader files, and the reason a case exists is written
nowhere. A pilot round of evals (`eval-bar-marketplace`) made this concrete: nine cases below the
bar, and reading why took a session.

## What Changes

- An eval's intent is written once, as the opening line of its `llm` grader (`Intent of this
  eval: ...`), so the judge reads it first and the lens shows it as the case summary. A case
  with no `llm` grader shows its prompt's first sentence and its graders as they are. No separate
  field or file.
- A new `qsm-builder` binary. Phase 1 has one verb: `qsm-builder lens export [dir] [--out
  <file>]` reads the marketplace in `dir` and writes one static, self-contained HTML file,
  by default `<marketplace>/.qsm/lens.html` (gitignored). No server, no network but the font
  link, English only.
- The page has top tabs (the marketplace overview with its reason to exist, one tile per plugin
  and a dependency graph; then one tab per plugin) and, inside a plugin, sub-tabs: its overview
  (its `## Why it exists` in full, dependencies with reasons, what it ships, CLI verbs, hooks,
  open epics and tasks, a graph of what it refers to: plugins, outside tools, web sources, MCP
  servers) and one tab per skill and agent (description, triggers and opening paragraph each with
  its source, flow, evals grouped by kind, tasks). Only the tab picked last shows.
- The repository is the only source. The page writes no file. Later phases add a local server, an
  edit as a task in the task tool (one task per edit, found by its `<where>:` title prefix), a
  `pull` verb that brings in edits made on the published page, a read-only view of the model in a
  Claude mod, and a new-item page.

## Capabilities

### New Capabilities

- `marketplace-lens`: the generated business view and its export, and the intent line every `llm`
  grader opens with. At archive it joins `plugins/qsm-builder/openspec/specs/qsm-builder/spec.md`,
  the plugin's own spec, which the root spec set does not hold.

### Modified Capabilities

None at the root.

## Impact

- New: `plugins/qsm-builder/qsm.json`, `scripts/cli.ts`, `scripts/install.ts`, `lib/lens/*`,
  `INSTALL.md`, `USAGE.md` (Iron Law 3: a plugin with a bin ships them).
- Changed: `.gitignore` gains `.qsm/`; the `llm` graders of qsm-plan, qsm-essentials,
  qsm-langdev-shell gain their intent line, the rest with their own eval tasks; `skill-standards`
  `## Evals`.
- No new dependency: `lib/cli-base.ts`, `lib/install-base.ts`, `Bun.YAML`.

## Critiques

- Devil's advocate: a page over files the agent already reads is a second surface to keep true.
  Fixed: it holds no data of its own, every export is rendered from the repository, and a test
  compares the rendered fields with the files.
- Devil's advocate: a static page cannot answer a question the person has only after reading it.
  Waived for phase 1: the person asked to see first; edits come as tasks in a later phase.
- Future archaeologist: why is an eval's intent in a grader and not a field? Fixed in design
  decision 6: a field beside the grader says the same thing twice, and the judge reads the grader.
- Scope sniper: the server, editing, the mod view, `pull` and the new-item page are not needed to
  answer "what does this eval check". Fixed: phase 1 is the export alone; each later phase is
  droppable without touching it.
- Scope sniper: a compiled bin and install for a page. Waived: the person chose the bin so the
  lens runs from any marketplace directory (Iron Law 9); the install base already exists.
