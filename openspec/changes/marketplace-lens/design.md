## Context

The marketplace holds 30 plugins. What a skill is for lives in its frontmatter and body, what it
depends on in `plugin.json` and in names inside the body, and what its evals check in `case.yaml`
or prompt frontmatter, `prompt.md`, and one file per grader. Why a case exists is written nowhere.
The person wants one business-level view of it, beside the chat, never instead of it: they read and
change the marketplace at the level of intent and use case, and agree each change with the agent
that implements it. The view must open offline from the repository and online as a published
artifact. The repository stays the only source.

## Goals / Non-Goals

**Goals:**

- Answer "what does this plugin, skill, agent or eval do, and why" on one page per plugin.
- Run from any marketplace directory and produce a file that opens with no server.

**Non-Goals:**

- No writing of plugin files from the page.
- No resolution or checking of names outside the plugin; a reference is a name in the graph.
- No eval runs; the latest result is read from `evals/results/` when a machine-readable file is
  there, else the page says "not read".
- The page never writes a plugin file, in any phase. It never runs an eval.

## Decisions

1. **The tool is the `qsm-builder` binary** (person's choice). Iron Law 8 and 9: one bin named
   after the plugin, compiled, on PATH, verbs in `qsm.json`: `lens export` and `doctor`.
   Alternative rejected: a script run by path, which breaks Iron Law 9.
2. **One model, one renderer.** `lib/lens/model.ts` reads the marketplace into one typed value
   (plugins, intents, skills, agents, verbs, hooks, cases, graders, references, last results, open
   tasks). `lib/lens/page.ts` turns it into one HTML fragment with the model's text inline and
   a small inline script that switches tabs by hash (`#overview`, `#<plugin>`,
   `#<plugin>/<item>`). Graphs are
   inline SVG laid out by the code, deterministically. Alternative rejected: a layout or UI
   library, which adds a dependency for two small graphs.
3. **The repository is the only source, and an edit never writes a file.** A later phase turns an
   edit into a task in the task tool, one per edit, found by its `<where>:` title prefix, where
   `<where>` names the plugin or item. Edits made on the published page come in through a later
   `pull` verb. A Claude mod may later show a read-only view of the same model. None of this is in
   phase 1; the model is shaped so it can be.
4. **English only.** Every label on the page is English; text read from files is shown as is.
5. **A static file cannot go stale in place, so the page says when it was made.** The page names
   the marketplace directory and the time it was written.
6. **An eval's intent is the opening line of its `llm` grader** (person's correction): `Intent of
   this eval: ...`. Written once, read by the judge first and by the lens as the case summary.
   A case without an `llm` grader shows its prompt's first sentence and its graders as they are
   (regex pattern, tool and counts). Rejected: separate `intent`/`expects` keys, which say the
   same thing a second time beside the grader.
7. **References are names found by pattern**, not parsed meaning, of four kinds, each with its
   colour and its legend entry: other plugins of this marketplace (`dependencies`, `qsm-<name>`
   and `<plugin>:<item>` in the plugin's files); outside tools and projects (a whole word from the
   searched-names list, decision 19); web sources (hosts of URLs); MCP servers (the
   plugin's `.mcp.json` and `mcp__<server>__` tool names in its files). Each becomes a node; none
   is resolved. A name outside the list is not drawn: the list is the price of no guessing.
8. **Two levels of tabs, one visible page.** The top tabs are the marketplace overview and the
   plugins. Inside a plugin, sub-tabs are the plugin's own overview and one tab per skill and
   agent, with a link back to the plugin overview. Apart from the header and the tab bars, the
   page shows only the tab picked last. The plugin overview opens with the README's `## Why it
   exists`, then the dependencies with their reasons (decision 21), what it ships, CLI verbs,
   hooks, the open epics and tasks (decision 21), references and a collapsed developer section. A
   skill or agent tab shows its description, triggers and opening paragraph as separate parts that
   say where each comes from (decision 20), a short flow from its `##` headings, its evals
   (decision 22), its tasks and a collapsed developer section (path, model, tools).
9. **Open tasks are optional.** When the task tool is on PATH, a plugin tab lists its open
   tasks: those whose title starts with `<plugin>:` or with the name without `qsm-` (`web:`),
   then the open project tasks that name the plugin, each with its id, title and a source label.
   A skill or agent tab lists the ones that name it. Without it the page says tasks were not read.
10. **The output lives inside the marketplace.** Without `--out` the file is
    `<marketplace>/.qsm/lens.html`, regenerated on each run and gitignored (`.qsm/`); `--out`
    overrides. The tool writes no directory outside the marketplace.

11. **Business first, technical below.** Every page opens with what a person needs to decide: why
    the plugin exists, what the item's description says it does, the situation each eval sets and
    what its graders accept, the last result with and without the plugin. Patterns, paths, turn
    limits, model and tools sit in a collapsed developer section.
12. **The look is the design the person approved** (2026-10-10, artifact version 5):
    dark pastel by default with a
    pastel light mode and a toggle, a dotted ground, one sheet behind everything, sharp corners,
    2px edges, soft hard-offset shadows, a few slightly rotated floating items, Archivo Black
    headings in sentence case, Rubik body, JetBrains Mono code, moderate contrast, no running
    header, the light and dark toggle at the top right corner. `lib/lens/style.ts` holds its
    tokens; the artifact look skill (task qsm-ndju) makes
    it the look of every artifact the marketplace makes.
13. **Editing (phase 2): a pen on every text, fields for configuration, text boxes for prose**
    (person's choice). The served page reads like the export; a small pen at the top right of each
    text read from the marketplace turns that one text into its control with a note box, and save
    makes one task for it. Rejected: one save for a whole page, which breaks the one edit, one
    sha256, one task match. Frontmatter and `case.yaml` fields become form controls (name,
    description, trigger words, model, tools, tags, runs, max turns, grader type). The markdown body
    below its headings becomes a text box, and the plugin's `## Why it exists` a text box at the top
    of its overview. An eval case can be added or removed (removal is in the case's pen menu,
    decision 22); a new one is described in two sentences, what the eval does and what the grader
    expects. Saving writes no file: each edit becomes one task (decision 14).
14. **An edit is a task in the task tool, never a file write.** One task per edit, titled
    `<where>: <what>` (`<where>` is the plugin, or `<plugin>:<item>`), its description holding the
    target file, the section, the sha256 of the file when the page was made, the text before, the
    text after, and the person's note (for an eval: the business use case it should check). A task
    whose sha256 no longer matches its file is stale and is never applied as is. Rejected: a
    separate wanted-changes file, which is a second tracker beside the task tool.
15. **Two doors for an edit, one record.** Local: `qsm-builder lens [dir] [--port]` serves the
    page on 127.0.0.1, rendered from the repository on every request, and turns a saved edit into
    the task itself through the task tool, so the person does nothing by hand (a browser alone
    cannot run a command). The served page is live: the server watches the marketplace and tells the
    page over one event stream when a file changed, and the page redraws without losing a text being
    edited, so an edit the agent applied shows at once. An exported page is a snapshot. Online:
    `lens export` publishes as an artifact; the page saves edits into the artifact's database
    when that runtime is present, and `qsm-builder lens pull <artifact-url>` turns each row into
    the same task and marks the row taken. Opened from disk with neither, the page is read-only and
    says where edits can be made.
16. **The agent works the edits with the person.** A hook adds a plugin's open tasks to the
    agent's context the first time in a session it reads or edits a file of that plugin, once per
    plugin. `qsm-builder lens tasks [plugin]` lists the same for any agent, feedback tasks from
    the one feedback epic included. For each task the agent shows what changes (before, after, the
    note), says what it would do or why it refuses (a skill over 12 KB is a split, a behaviour
    change goes through spec-propose), writes only after the person's yes, runs the plugin's eval
    for an edited skill, and closes the task with what was done.
17. **The mod is a read model.** A Claude Code mod shows the same model read-only in a pane, with
    the same levels (marketplace, plugin, skill or agent) and the open tasks; it reads through the
    `qsm-builder` noun. Editing stays on the page.
18. **New items start on the page (phase 4).** A new-item page for a skill, an agent or a plugin,
    opened from the overview, offers the fields a detail page has, plus: intent and use case,
    trigger words, model, tools, whether it ships a CLI, which plugins it links to, "check whether
    this already exists" (the words typed against the names and descriptions of every plugin, skill
    and agent), and at least one eval case described by what it does and what the grader expects.
    Saving makes one task of kind new, through the same edit path: `file` is the file the item
    would start in, `sha256` is `missing`, and the description says `kind: new`. The server refuses
    a new item without an eval case, with a file that already exists, or with a path outside the
    three shapes (`skills/<name>/SKILL.md`, `agents/<name>.md`, `.claude-plugin/plugin.json`).
    Such a task is stale once its file exists. `add-plugin` starts from that task and searches for
    an existing owner before it proposes where the item goes. A skill without an eval is not
    created. A preview of the flow is not offered: the flow is read from the `##` headings of a body
    that a new item does not have yet.

19. **Three levels, like C4, each with its own dependency graph** (person's choice). Marketplace,
    then plugin, then skill or agent. As in C4, each level shows only its own detail and the next
    level down shows more (person's correction after the first look, when the overview drew every
    outside name): the marketplace graph holds the plugins and their dependencies only, not even a
    count of outside names (second correction); a plugin graph the plugin, its skills, agents, hooks
    and CLI, and the names each refers to; a skill or agent graph that item and the names in its own
    files. The searched names are one plain list owned by the tool,
    `plugins/qsm-builder/references.txt` (one name per line, `#` comment), read from the marketplace
    shown when it is there and else from the copy built into the binary, so another marketplace
    still gets a graph. A name matches as a whole word anywhere in a file, backticked or not, so
    projects like `beads` or `shell-ast` are found in prose. The served page redraws when the list
    changes; an export uses the list of its moment. Rejected: the fixed set in `refs.ts`, which a
    person cannot change without a release.

20. **A skill or agent page says where each text comes from** (person's review of the served
    page: "I do not know what the intent is, what it promises, where it is from"). The top box is
    three labelled parts, each with a caption naming its source: the description (`SKILL.md`
    frontmatter; it decides when the skill fires), the trigger words as chips (the `Triggers:` list
    inside that description), and the opening paragraph (the first paragraph of the `SKILL.md`
    body). "What it promises" and "intent" are no longer labels: a name the reader cannot trace to
    a file is not shown.
21. **The plugin overview opens with its reason and its links.** First its `## Why it exists`
    (README), then its dependencies, each with the reason written in the plugin's spec under the
    `Dependencies` requirement (a name with no reason says so), then the open epics and tasks that
    name it: an epic that parents a listed task is listed with that task under it. `Dependencies`
    is read as `-`name`: reason` lines of that requirement.
22. **Evals are grouped by kind and read like a form** (person's review: "what proves it instead of
    evals, random sections, is settings an eval?, why can I edit this, why is the last result in
    the same table and colour?"). The card is called Evals. Cases sit under their kind, each kind
    with one line on what it measures: `fire` (does the skill load when it should), `negative`
    (does it stay quiet when it should), `scenario` (does the work come out better with the
    plugin), other tags last. A case is headed by its intent line (else its prompt's first
    sentence), then: what the agent is given (the prompt), what the graders accept (each grader
    in words: `skill-fired` of type `tool_used` reads "passes when the agent called the Skill tool
    at least once; checked only with the plugin installed"), and the settings in words (runs: how
    many times the case runs per arm; max turns: the agent's turn budget). A field's pen form
    carries a one-line hint on why it is editable. The last result is a read-only block of its own
    colour: with and without counts, the delta, whether the case meets the bar of
    `skill-standards` (all runs with the plugin pass, at most one without), and the date of the
    result file. Remove case lives in the case's pen menu, a small button, not a block of its own.

## Risks / Trade-offs

- [A case with only `regex` and `tool_used` graders has no intent line] → it shows its graders and
  its prompt's first sentence; most such cases are fire and negative, whose purpose is the tag.
- [The exported page holds the text of every plugin, and a file is shareable] → the marketplace is
  public (Iron Law 10), so nothing new is exposed.
- [Text read from files reaches HTML] → every such text is escaped when the page is built.
- [The renderer grows into a framework] → one fragment builder and one inline script, proved by
  the real path (export this repository, compare fields with the files).

## Migration Plan

1 the bin and `lens export` (done); 2 the local server, editing (decision 13) and edits as
tasks (14, 15 local); 3 publishing, the artifact database and `pull` (15 online), the agent loop
and its hook (16), the read-only mod (17); 4 the new-item page and `add-plugin` (18). Rollback is
deleting the bin; plugin files are never touched by the tool.

## Open Questions

- Whether an item links to its file on GitHub or shows the path as text (asked, not answered;
  default: path as text).
- What the mod pane shows beyond the three levels and the tasks: settled in grilling before phase 3.
- The remaining plugins get their intent lines in the full eval review (task qsm-aqb8.30).
