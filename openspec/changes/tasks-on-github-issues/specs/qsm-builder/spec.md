## MODIFIED Requirements

### Requirement: Marketplace lens

The plugin SHALL ship a `qsm-builder` binary whose verbs show the marketplace as one page and never
write a plugin file: `lens [dir] [--port]` serves the page on 127.0.0.1 and turns a saved edit into
one loose task made through `qsm-tasks add`, `lens export [dir] [--out]` writes the same page as one
static HTML file, `lens readme [dir] [--check]` writes the root README's generated block and two
banners from the same model, `lens pull <artifact-url>` turns the edits saved on the published page
into tasks, `lens marketplace [--dir]` prints the whole marketplace as a read model (its reason to
exist, every plugin with its reason in one line and its dependencies), `lens plugin <name>` prints
one plugin as a read model (why it exists, skills and agents with their descriptions, dependencies
with their reasons), and `doctor` checks the binary runs and `qsm-tasks` is reachable. The page
SHALL open a plugin with its README's `## Why it exists` and its dependencies with the reasons its
spec gives; a skill or agent SHALL show its description, trigger words and opening paragraph each
with the file part it comes from, and its evals grouped by kind with the last result apart from the
editable fields. No verb SHALL read a task store, and no path of the lens SHALL name `.beads`. A
directory with no `.claude-plugin/marketplace.json` SHALL fail with `missing` naming that file.

#### Scenario: A pen edit is saved

- **WHEN** the person saves an edit on the served page and `qsm-tasks` is installed
- **THEN** one task is made through `qsm-tasks add` with no epic, titled with the plugin the edit
  belongs to, and no plugin file and no `.beads` path is touched

#### Scenario: The lens reads no tasks

- **WHEN** the person opens the page, runs `lens marketplace` or runs `lens plugin qsm-web`
- **THEN** the output lists no open task and no task count, and no `br` or `qsm-tasks` call is made

### Requirement: A marketplace and plugin view in a pane

The plugin SHALL register the slash command `/lens [plugin]`. Without a name it opens a pane that
draws the output of `lens marketplace`, with a plugin name the output of `lens plugin <plugin>`,
for the marketplace of the session's working directory, and it changes nothing. A press on a
plugin line of the first, or on a skill or agent line of the second, SHALL open the next level in
its own pane. A name the marketplace does not list, or a verb that fails, SHALL show the cause in
the pane.

#### Scenario: The person opens the marketplace

- **WHEN** the person runs `/lens`
- **THEN** a pane SHALL show the marketplace's why it exists and each plugin with one line and its
  dependencies

#### Scenario: The person opens one plugin

- **WHEN** the person runs `/lens qsm-web`
- **THEN** a pane SHALL show that plugin's why it exists, its skills and agents with one line each
  and its dependencies with reasons, and no key SHALL edit anything

#### Scenario: The person exports the marketplace

- **WHEN** the person runs `qsm-builder lens export` in a marketplace
- **THEN** one HTML file SHALL be written with an overview and one tab per plugin, and no plugin
  file SHALL change

#### Scenario: Edits wait on the published page

- **WHEN** the person saved two edits on the published artifact and runs
  `qsm-builder lens pull <url>`
- **THEN** two issues SHALL be made, both rows marked taken, and a second pull SHALL make none

#### Scenario: The exported page opened from disk

- **WHEN** the exported page runs with no artifact database
- **THEN** its pens SHALL stay hidden and the page SHALL say it is read-only and where edits are
  made

#### Scenario: qsm-tasks is not installed

- **WHEN** `qsm-tasks` is not on `PATH` and the person runs `qsm-builder doctor`
- **THEN** the command SHALL exit `missing` and name `qsm-tasks` as what to install

### Requirement: Dependencies

qsm-builder SHALL declare `qsm-openspec` and `qsm-tasks` in the `dependencies` array of its
plugin.json, each for one reason:

- `qsm-openspec`: serves the spec port; add-plugin hands every addition to the spec flow, where
  its requirement and scenarios are written before the build.
- `qsm-tasks`: makes one loose task for each edit saved on the page.

qsm-builder SHALL NOT depend on `qsm-essentials`: no skill, hook or verb of it calls one of the
core's skills, and SHALL read no task: its one use of `qsm-tasks` is that write.

#### Scenario: The spec port is installed with the plugin

- **WHEN** the plugin is installed
- **THEN** `claude plugin install` SHALL install `qsm-openspec` with it, because add-plugin is a
  skill with no code of its own that could fail

#### Scenario: The task tool is missing

- **WHEN** `qsm-tasks` is not installed and a saved edit is made into a task
- **THEN** the save SHALL fail with `missing` naming qsm-tasks, and the page, the export and the
  read models SHALL work as before

## REMOVED Requirements

### Requirement: Open tasks reach the agent

**Reason**: The hook added `lens brief`, which held only a plugin's open edits and feedback read
from the task store; no store is read any more, so there is nothing to add to the context.

**Migration**: `lens brief` and `lens tasks`, the hook in `hooks/register.tsx`,
`$.builder.lensBrief`, `lib/lens/tasks.ts` and the stale-edit marking are deleted, and the noun is
regenerated.
