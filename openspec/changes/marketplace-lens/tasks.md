## 1. Phase 1: the bin and the static export

- [x] 1.1 `qsm-builder` bin: `qsm.json` with `lens export` and `doctor`, `scripts/cli.ts` on
  `lib/cli-base.ts`, `scripts/install.ts` on `lib/install-base.ts`, `INSTALL.md`, `USAGE.md`,
  generated noun types. Owns:
  `plugins/qsm-builder/{qsm.json,scripts,types,hooks/noun.generated.ts,INSTALL.md,USAGE.md}`.
- [x] 1.2 `lib/lens/model.ts`: read a marketplace directory into the typed model. `missing`
  naming `.claude-plugin/marketplace.json` when it is absent. Owns:
  `plugins/qsm-builder/lib/lens/model.ts`. Blocked by 1.1.
- [x] 1.3 `lib/lens/page.ts` and `qsm-builder lens export [dir] [--out <file>]`: top tabs
  (overview and plugins), sub-tabs per plugin (overview, each skill and agent), one visible page,
  hash routes, four-kind reference graph, open tasks by plugin and by item, escaped text, default
  output `<marketplace>/.qsm/lens.html` (gitignored). End-to-end proof: export this
  repository; the top tab count is the plugin count plus one and the debugging skill's
  description on the page equals its `SKILL.md` frontmatter. Owns:
  `plugins/qsm-builder/lib/lens/{page,graph,style,refs,tasks}.ts`. Blocked by 1.2.

- [x] 1.4 Three levels with a graph each (design 19): the searched-names list in
  `plugins/qsm-builder/references.txt` replaces `KNOWN_TOOLS`, read from the shown marketplace
  else built in, whole-word match; the marketplace graph adds every outside name; each skill and
  agent tab gets its own graph; the `web:` short prefix lists a task on `qsm-web`. Proof: export
  this repository; `#qsm-web/web-ladder` has a graph with `searxng` and without `opensrc`, which
  only the plugin's CLI and docs name, while the `qsm-web` plugin graph has it. Blocked by 1.3.

## 2. Eval intent lines

- [x] 2.1 Open every `llm` grader of qsm-plan, qsm-essentials and qsm-langdev-shell with
  `Intent of this eval: <business use case>`, written from the step maps. The person reviews the
  wording before it is committed. Owns:
  `plugins/{qsm-plan,qsm-essentials,qsm-langdev-shell}/evals/*/graders/*.md`.
- [x] 2.2 The rule in `skill-standards` `## Evals`: an `llm` grader opens with its intent line.
  Owns: `plugins/qsm-builder/skills/skill-standards/SKILL.md`.
- [ ] 2.3 Probe: one rerun of one changed case (`bun run eval <plugin> --case <case> --runs 1`)
  shows the judge still grades as before with the intent line in place. Blocked by 2.1.

## 3. Phase 2: the local server, editing, edits as tasks

- [x] 3.1 `qsm-builder lens [dir] [--port]`: `Bun.serve` on 127.0.0.1, the page rendered from
  the repository per request; `failed` naming the port when it is taken; live: a file watch on
  the marketplace and one event stream, the page redraws and keeps a text being edited. Proof: add
  a name to `references.txt` while the page is open, the graph shows it with no reload. Blocked by
  1.4.
- [x] 3.2 Editing on the served page (design 13): a pen at the top right of every text read from the
      marketplace turns that one text into its control with a note box; form controls for
      frontmatter and `case.yaml` fields, a text box for the body below its headings and for the
      plugin's `## Why it exists`, add and remove an eval case with "what it does" and "what the
      grader expects". Blocked by 3.1.
- [x] 3.3 Save turns an edit into one task through the task tool (design 14): title
      `<where>: <what>`, description with file, section, sha256, before, after, note; stale when the
      sha256 differs. Proof: edit a description on the page, one task appears, `git diff` shows no
      plugin file changed. Blocked by 3.2.
- [x] 3.4 `qsm-builder lens tasks [plugin]` lists a plugin's open tasks (edits and feedback) with
  their stale state. Blocked by 3.3.

## 4. Phase 3: online, the agent loop, the mod

- [x] 4.1 Publish: the exported page saves edits into the artifact database when the runtime is
  there, read-only otherwise (load the artifact-capabilities skill first). Blocked by 3.2.
- [x] 4.2 `qsm-builder lens pull <artifact-url>`: each row becomes the same task, the row is
  marked taken, a second pull creates none. Blocked by 4.1, 3.3.
- [ ] 4.3 The hook that adds a plugin's open tasks the first time the agent touches its files,
  once per plugin per session, and the agent loop in `skill-standards` (design 16); both are
  written. Open: the proof that one edit made on the page reaches a commit in a real session after
  the person's yes. Blocked by 3.4.
- [x] 4.4 The read-only Claude mod pane over the `qsm-builder` noun (design 17): `/lens` the
  marketplace, `/lens <plugin>` the plugin, a press opens the next level. Blocked by 1.2.

## 5. Phase 4: start new items from the lens

- [x] 5.1 New-item page for a skill, an agent or a plugin (design 18), saved as one task of kind
  new, refused without an eval case. Blocked by 3.3.
- [x] 5.2 `add-plugin` starts from that task and searches for an existing owner first. Blocked by
  5.1.

## 6. Lens fixes from the first look

- [x] 6.1 The light and dark toggle sits at the top right corner of the page (design 12).
- [x] 6.2 Each hook shows its event, the comment above its `on(` call (or a classic hook's opening
  comment) and the `$.<noun>.<verb>(` calls inside it with their `qsm.json` descriptions; "no
  description is written" when it has neither. Proof: qsm-memory's `session.start` shows `save`
  with its description.
- [x] 6.3 The overview graph takes a plugin multi-select kept in the hash: none picked draws no
  outside-name edges, picked plugins draw only their edges and dim what they do not reach.
- [x] 6.4 `claude` leaves `references.txt`: every plugin here is for Claude Code, so the CLI is no
  outside dependency.
- [x] 6.5 C4 levels (design 19): the overview graph shows plugins and their dependencies only,
  nothing outside; the plugin graph shows the plugin, its
  skills, agents, hooks and CLI and the names each refers to; the skill or agent graph stays.
  Proof: the overview has no `opensrc` node and the `qsm-web` graph links `opensrc` to its CLI.

## 7. Reading the served page (person's review of the lens)

- [x] 7.1 Skill and agent page: description, trigger chips and opening paragraph as separate parts
  with their source named; "What proves it" becomes Evals, grouped by kind, each case headed by its
  intent line with prompt, graders in words, settings explained, edit hints, a read-only result
  block, remove case in the case's pen menu (design 20, 22).
- [x] 7.2 Plugin overview: `## Why it exists` first, dependencies with reasons from the spec, open
  epics with their tasks (design 21).

## 8. The root README is styled like the lens

- [x] 8.1 `qsm-builder lens readme [dir] [--check]` writes two banners and the README's generated
  block from the lens model; the generated gate runs the check. Proof: `bun run validate` is stale
  after a banner changes, and the block follows a plugin's first sentence.
