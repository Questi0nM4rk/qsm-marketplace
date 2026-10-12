## ADDED Requirements

### Requirement: An eval's intent lives in its grader, where the judge reads it

The intent of an eval case (the business use case it checks, and why the case exists) SHALL be
written once, as the opening line of the case's `llm` grader: `Intent of this eval: <one or two
sentences>`, so the judge reads it first. It SHALL NOT be kept in a separate field or file. The
lens SHALL show that line as the case's summary; a case with no `llm` grader SHALL show its
prompt's first sentence and its graders as they are (pattern, tool, counts).

#### Scenario: The judge grades a case

- **WHEN** an `llm` grader is sent to the judge
- **THEN** its first line SHALL state the intent of the eval, before the PASS and FAIL text

#### Scenario: A case has no llm grader

- **WHEN** a case holds only `regex` and `tool_used` graders
- **THEN** the page SHALL show the first sentence of its prompt and each grader as it is

### Requirement: The lens exports the marketplace as one static HTML file

`qsm-builder lens export [dir] [--out <file>]` SHALL read the marketplace in `dir` (default: the
working directory) and write one self-contained HTML file: no server, no network but the font link,
English labels. Without `--out` the file SHALL be `<dir>/.qsm/lens.html`, rewritten on each run
and gitignored; no file outside the marketplace is written unless `--out` names one. Every value on
it SHALL be read from the repository when the file is written. Text read from files SHALL be
escaped. When `dir` has no `.claude-plugin/marketplace.json` the command SHALL exit non-zero with
`missing` and name that file.

#### Scenario: The person exports this repository

- **WHEN** the person runs the export on the repository
- **THEN** one file SHALL be written with one tab per plugin in `marketplace.json` plus an
  overview, and each skill's description on it SHALL equal its `SKILL.md` frontmatter

#### Scenario: No output path is given

- **WHEN** the person runs the export without `--out`
- **THEN** the page SHALL be written to `.qsm/lens.html` in the marketplace, replacing the
  previous one

#### Scenario: The directory is not a marketplace

- **WHEN** `dir` has no `.claude-plugin/marketplace.json`
- **THEN** the command SHALL exit non-zero with `missing` and name the file it looked for

#### Scenario: A description holds markup

- **WHEN** a description read from a file contains `<script>`
- **THEN** the page SHALL show it as text and execute nothing

### Requirement: The lens writes the root README's block and banners

`qsm-builder lens readme [dir] [--check]` SHALL write, from the model the lens page reads, two SVG
banners in the lens palette and type, `assets/lens-banner-light.svg` and
`assets/lens-banner-dark.svg`, and the text of the root `README.md` between `<!-- lens:start -->`
and `<!-- lens:end -->`: the banner in a `<picture>` with `prefers-color-scheme` sources, a short
"What it is", the overview graph as a Mermaid `flowchart` of plugins and their dependencies only
with an arrow from the plugin used to its user, one catalog table per kind of plugin (Plugin as a
link to its README, Why it exists as its first sentence, Ships as counts of skills, agents, CLI
and hooks), and how to serve and export the lens. A plugin's kind SHALL be the first of core,
planning, code quality and languages, and knowledge and web whose words meet a `keywords` entry of
its plugin.json, and tooling when none does. Text outside the markers SHALL stay as it is. A
README without both markers SHALL fail with `missing`. With `--check` nothing SHALL be written and
the verb SHALL exit `worse` and name each file that differs from what would be written; the
generated gate runs the same comparison.

#### Scenario: The block follows the plugins

- **WHEN** the person runs `qsm-builder lens readme` after a plugin's `## Why it exists` changed
- **THEN** that plugin's catalog row SHALL show its new first sentence and the text outside the
  markers SHALL be unchanged

#### Scenario: The README is stale

- **WHEN** a banner differs from what would be generated and the person runs the verb with
  `--check`
- **THEN** it SHALL exit `worse`, name that banner and write nothing

### Requirement: The page has plugin tabs, each with sub-tabs, and shows one page at a time

The page SHALL have three levels of abstraction, like the C4 model: the marketplace, then a plugin,
then a skill or agent. Each level SHALL show only its own detail, so the lower the level the more it
shows. The marketplace graph SHALL hold every plugin and the dependencies between them, and nothing
outside the marketplace: no outside name and no count of them. The plugin graph SHALL hold the
plugin, its skills, agents, hooks and CLI, and the outside names each of them refers to. The skill
or agent graph SHALL hold that item and the names in its own files. The top tabs SHALL be the
marketplace overview and one tab per plugin. Inside a plugin, sub-tabs SHALL be the plugin's own
overview and one tab per skill and agent, with a way back to the plugin overview. Apart from the
header and the tab bars, the page SHALL show only the tab picked last. Tabs SHALL switch by the URL
hash (`#overview`, `#<plugin>`, `#<plugin>/<item>`) and by keyboard. The marketplace overview SHALL
show the `## Why it exists` of the marketplace README, one tile per plugin (the first sentence of
its `## Why it exists`, counts of skills, agents, eval cases and open tasks), and a graph of the
dependencies between plugins. A plugin overview SHALL open with its `## Why it exists` in full,
then its dependencies with their reasons, what it ships, its CLI verbs, its hooks, its open epics
and tasks, a graph of what it refers to and a collapsed developer section. A skill or agent tab
SHALL show its description, trigger words and opening paragraph as three labelled parts that each
name their source, a short flow from its `##` headings, its evals, its tasks and a collapsed
developer section (path, model, tools).

#### Scenario: The person opens a skill

- **WHEN** the page is opened at `#qsm-essentials/debugging`
- **THEN** only that skill's tab SHALL show under the header and the tab bars, and its sub-tab
  bar SHALL offer the plugin overview

#### Scenario: The person reads where a skill's texts come from

- **WHEN** the person opens a skill's tab
- **THEN** its description SHALL be labelled as `SKILL.md` frontmatter that decides when the skill
  fires, its trigger words as the `Triggers:` list of that description, and its opening paragraph
  as the first paragraph of the `SKILL.md` body, each text under its own caption

#### Scenario: The person goes down a level

- **WHEN** the person opens the marketplace overview, then `qsm-web`, then its `web-ladder` skill
- **THEN** each of the three pages SHALL show its own dependency graph, and the skill's graph SHALL
  hold only names found in that skill's files

#### Scenario: The overview hides the outside names

- **WHEN** the person opens the marketplace overview
- **THEN** its graph SHALL show only plugins, and `opensrc` SHALL first appear on the `qsm-web`
  plugin graph

#### Scenario: Results and tasks cannot be read

- **WHEN** no machine-readable result file is in a plugin's `evals/results`,
  or the task tool is not on PATH
- **THEN** the page SHALL say the results or the tasks were not read, never show them as none

### Requirement: A plugin tab lists its open epics and tasks

A plugin overview SHALL list the open tasks whose title starts with `<plugin>:`, or with the plugin
name without its `qsm-` prefix (`web:` for `qsm-web`), and the open
project tasks that name the plugin, each with its id, title and a label of why it is listed. An
open epic that parents a listed task SHALL be listed too, with its listed tasks under it. A skill
or agent tab SHALL list the open tasks that name it.

#### Scenario: A task names a skill

- **WHEN** an open task's title names a skill of the plugin
- **THEN** it SHALL be listed on that skill's tab and on the plugin overview, under its epic when
  that epic is open

### Requirement: A plugin overview shows its dependencies with their reasons

A plugin overview SHALL list each name in the `dependencies` of its `plugin.json` with the reason
written for it in the `Dependencies` requirement of `openspec/specs/<plugin>/spec.md`, one
`-`name`: reason` line per name. A name with no such line SHALL be shown with
"no reason is written"; a plugin without dependencies SHALL say so.

#### Scenario: A dependency has a reason

- **WHEN** qsm-builder declares `qsm-openspec` and its spec gives a reason for it
- **THEN** the overview SHALL show `qsm-openspec` with that reason

#### Scenario: A dependency has no reason

- **WHEN** a declared dependency has no line in the `Dependencies` requirement
- **THEN** the overview SHALL show the name with "no reason is written"

### Requirement: References are names of four kinds, never resolved

A graph of references SHALL show the names a plugin's files refer to, each kind with its own colour
and legend entry: other plugins of this marketplace (`dependencies`, `qsm-<name>`,
`<plugin>:<item>`), outside tools and projects (a word in the list of searched names, below), web
sources (hosts of URLs) and MCP servers (the plugin's `.mcp.json`, `mcp__<server>__` names). A name
SHALL be shown, never resolved or checked. An arrow SHALL point from what is used to the
plugin that uses it.

#### Scenario: A skill names a skill of another plugin

- **WHEN** a body names `qsm-openspec:spec-propose`
- **THEN** the graph SHALL show a node `qsm-openspec` linked to the plugin, with no check that the
  item exists

#### Scenario: A body names an outside tool

- **WHEN** a tool is in the list and a file of the plugin mentions one of its commands
- **THEN** the graph SHALL show a node for that tool of the tool kind

### Requirement: The searched names are one list the person edits

The searched names SHALL be one plain list owned by the tool: `plugins/qsm-builder/references.txt`,
one name per line, `#` starting a comment. The lens SHALL read it from the marketplace it shows
when that file is there, and else use the copy built into the binary. A name SHALL match as a whole
word anywhere in a plugin's files (a hyphen continues a word). The served page SHALL redraw its
graphs when the list changes; an exported page SHALL use the list as it was when it was written.

#### Scenario: The person adds a name to the list

- **WHEN** the person adds `shell-ast` to `references.txt` while `qsm-builder lens` serves the
  page
- **THEN** the open page SHALL show `shell-ast` in every graph whose files name it, with no restart

### Requirement: A hook says what it does

A plugin overview SHALL show each hook with its event, what it does and the verbs it calls. What it
does SHALL be the comment written directly above the hook's `on("<event>", ...)` call in
`hooks/register.tsx`, or the opening comment of a classic command hook's source. The verbs it calls
SHALL be the `$.<noun>.<verb>(` calls inside that hook, each with its description from the
plugin's `qsm.json`. A hook with neither SHALL say that no description is written.

#### Scenario: A hook calls a verb

- **WHEN** qsm-memory's `session.start` hook calls `$.memory.save`
- **THEN** the hook SHALL show `session.start`, the comment above it, and `save` with the
  description `qsm.json` gives that verb

#### Scenario: A hook has no comment and calls no verb

- **WHEN** a hook has no comment above it and calls no verb of its noun
- **THEN** the page SHALL say no description is written for it, never leave the line empty

### Requirement: The overview graph shows the edges of the plugins the person picks

The marketplace overview graph SHALL offer a multi-select of the plugins with every plugin picked
at the start. An edge SHALL be drawn only when each plugin at its ends is picked; an unpicked plugin
and an outside name no drawn edge reaches SHALL be dimmed. A pick other than all SHALL be kept in
the URL hash so a reload keeps it.

#### Scenario: The person picks two plugins

- **WHEN** the person leaves only `qsm-web` and `qsm-memory` picked on the overview
- **THEN** only edges between those two and from them to outside names SHALL be drawn, and every
  other node SHALL be dimmed

#### Scenario: The person opens the overview

- **WHEN** the overview opens with no pick in the hash
- **THEN** every plugin SHALL be picked and every edge drawn

### Requirement: Evals are grouped by kind and each case reads in plain words

A skill or agent tab SHALL call its eval section `Evals` and group its cases by tag: `fire`,
`negative`, `scenario`, then any other, each group opening with one line on what that kind
measures. A case SHALL be headed by its intent line, or its prompt's first sentence without one, and
SHALL show the prompt the agent is given, each grader with its name, type and a sentence saying what
it accepts (for a `tool_used` grader: the tool, the least and most calls, which arm it is checked
in), and its settings with what each means (runs per arm, the agent's turn budget). A field's edit
form SHALL carry a one-line hint on why it can be edited. The last result SHALL be a read-only block
apart from the editable fields, showing the passes with and without the plugin, their difference,
whether the case meets the bar, and the date of the result file; without a result file it SHALL say
which of "no results" or "not read" holds. Removing a case SHALL be offered from the case's pen
menu.

#### Scenario: The person reads a fire case

- **WHEN** the person opens a skill with a `tool_used` grader named `skill-fired` on the `Skill`
  tool, `min: 1`, `arm: with-only`
- **THEN** the case SHALL appear under `fire` and the grader SHALL read "passes when the agent
  called the Skill tool at least once; checked only with the plugin installed"

#### Scenario: A result exists

- **WHEN** the latest aggregate has 3 of 3 passes with the plugin and 1 of 3 without
- **THEN** the result block SHALL show both counts, a difference of 67 points, the bar as met, and
  the file's date, and carry no pen

### Requirement: Configuration is edited in fields and prose in text boxes, and saving writes no file

Every text on the page that is read from the marketplace SHALL carry a small pen button at its top
right on the served page. The text SHALL read as text until the pen is pressed; the pen SHALL turn
that one text into its edit control with a note box, and save SHALL make one task for that one text.
The page served by `qsm-builder lens` SHALL show frontmatter and `case.yaml` fields (name,
description, trigger words, model, tools, tags, runs, max turns, grader type) as form controls, the
markdown body below its headings as a text box, and the plugin's `## Why it exists` as a text box at
the top of its overview, and an eval case's intent line from its pen menu. An eval case SHALL be
addable and removable; a new case SHALL be described by what the eval does and what its grader
expects. Saving SHALL write no plugin file.

#### Scenario: The person changes a skill's description

- **WHEN** the person presses the pen on a skill's description, changes it and saves
- **THEN** the skill's `SKILL.md` is unchanged and one task records the edit

#### Scenario: The person adds an eval case

- **WHEN** the person adds a case with "what it does" and "what the grader expects" and saves
- **THEN** one task records the new case with both sentences, and no file under `evals/` changes

### Requirement: An edit becomes one task in the task tool

Each saved edit SHALL become one task titled `<where>: <what>`, where `<where>` is the plugin or
`<plugin>:<item>`. Its description SHALL hold the target file, the section, the sha256 of the file
when the page was made, the text before, the text after, and the person's note. A task whose
sha256 no longer matches its target file SHALL be shown as stale and SHALL NOT be applied as is.

#### Scenario: The file changed after the edit

- **WHEN** the target file was edited after the page was made
- **THEN** the page and `qsm-builder lens tasks` mark the task stale

### Requirement: Edits arrive locally through the server and online through pull

`qsm-builder lens [dir] [--port]` SHALL serve the page on 127.0.0.1 only, render it from the
repository on every request, tell an open page when a file of the marketplace changed so it shows
the new state without a manual reload (a text being edited is kept), and create the task for a saved
edit itself, so the person runs nothing. The exported page, published as an artifact, SHALL save
edits into the artifact's database when that runtime is present.
`qsm-builder lens pull <artifact-url>` SHALL turn each row into the same task and mark the row
taken. Opened from disk with neither, the page SHALL be read-only and say where edits can be made.

#### Scenario: The port is taken

- **WHEN** the chosen port is in use
- **THEN** the command exits `failed`, names the port, and suggests `--port`

#### Scenario: The exported page opened from disk

- **WHEN** the exported page runs with no artifact database
- **THEN** its pens stay hidden and it says it is read-only and where edits are made

#### Scenario: Edits wait on the published page

- **WHEN** the person saved two edits on the published artifact
- **THEN** `qsm-builder lens pull <url>` creates two tasks and a second pull creates none

### Requirement: The agent works each edit with the person before it writes

A hook SHALL add a plugin's open tasks to the agent's context the first time in a session the agent
reads or edits a file of that plugin, once per plugin per session. `qsm-builder lens tasks
[plugin]` SHALL list the same tasks, the feedback epic's included, with their stale state. For each
task the agent SHALL show what changes and the note, say what it would do or why it refuses, write
only after the person agrees, run the plugin's eval for an edited skill, and close the task with
what was done. A behaviour change SHALL go through spec-propose.

#### Scenario: The agent opens a plugin with edits waiting

- **WHEN** the agent reads a file of a plugin that has two open edit tasks
- **THEN** its context gains those two tasks once, and not again on the next read

#### Scenario: An edit would break the skill standards

- **WHEN** an edit would push a `SKILL.md` over 12 KB
- **THEN** the agent says so and proposes a split instead of applying it

### Requirement: A Claude mod shows the lens's model read-only

A Claude Code mod SHALL show the same model in a pane, with the levels marketplace, plugin, and
skill or agent, and the open tasks of what is shown, read through the `qsm-builder` noun. `/lens`
SHALL open the marketplace, `/lens <plugin>` a plugin. A plugin line of the marketplace pane and a
skill or agent line of a plugin pane SHALL open the next level in its own pane when pressed. The
pane SHALL offer no editing.

#### Scenario: The person opens the pane on the marketplace

- **WHEN** the person runs `/lens`
- **THEN** the pane shows the marketplace's reason to exist and every plugin with its reason in one
  line, its dependencies and its count of open tasks

#### Scenario: The person opens the pane on a plugin

- **WHEN** the person opens the mod pane and picks a plugin
- **THEN** the pane shows that plugin's intent, its skills and agents, its dependencies with their
  reasons and its open tasks

#### Scenario: The person opens a skill from the plugin pane

- **WHEN** the person presses a skill line in a plugin pane
- **THEN** a pane opens with that skill's description and trigger words

### Requirement: A new skill, agent or plugin starts on the page

The served and the published page SHALL offer a new-item page for a skill, an agent or a plugin,
reached from the overview, with the fields a detail page has plus intent and use case, trigger
words, model, tools, whether it ships a CLI, the plugins it links to, "check whether this already
exists", and at least one eval case described by what it does and what the grader expects. Saving
SHALL make one task of kind new through the same edit path as any edit, naming the file the item
would start in with the sha256 `missing`. Saving SHALL be refused without an eval case, for a file
that already exists, and for a path that is not a skill, an agent or a plugin manifest of a
marketplace plugin. `add-plugin` SHALL start from that task and search for an existing owner first.
A task of kind new SHALL show as stale once its file exists.

#### Scenario: The person asks for a new skill without an eval

- **WHEN** the person fills the new-skill page with no eval case and saves
- **THEN** the page refuses and names the missing eval case

#### Scenario: The person asks for a new skill with an eval

- **WHEN** the person fills the new-skill page with an eval case and saves
- **THEN** one task of kind new records every field, and no file under `plugins/` is made

#### Scenario: The item already exists

- **WHEN** the file a new item would start in exists
- **THEN** the save is refused and names the file
