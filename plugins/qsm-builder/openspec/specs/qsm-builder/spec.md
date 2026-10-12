# qsm-builder Specification

## Purpose

qsm-builder helps a developer extend this marketplace.

## Requirements

### Requirement: Plugin scaffolding and content placement

The plugin SHALL offer a skill, add-plugin, that is the checklist for adding anything to this
marketplace: a new plugin for one capability, or a skill, agent, command, hook, CLI verb or document
inside a plugin that already exists. Its order SHALL be search for an existing home, why it exists,
spec, build, proof, and its opening SHALL say that purpose in plain words. For any addition, the
skill SHALL search the marketplace for the same concept before writing anything, and SHALL edit an
existing canonical home in place rather than duplicate it. For a new plugin, the skill SHALL
scaffold its manifest, its command metadata, a README opening with its why-it-exists section written
before the specification, and a specification written before the build. For every addition it SHALL
require a passing validation run plus an empirical check that the new surface appears in a fresh
session before the task is done.

#### Scenario: Developer asks for a new capability

- **WHEN** a developer asks to add a capability that has no plugin yet
- **THEN** the skill SHALL scaffold one plugin directory carrying its manifest, command metadata,
  README opening with its why-it-exists section, specification, and code, and SHALL require the
  developer to run validation and confirm the new surface appears in a fresh session before the task
  is done

#### Scenario: The concept already has a home

- **WHEN** a developer asks to add content whose concept already exists
  under a different name elsewhere in the marketplace
- **THEN** the skill SHALL edit the existing document in place instead of
  creating a new one

#### Scenario: A hook added to an existing plugin

- **WHEN** a developer asks to add a hook, a skill or a CLI verb to a plugin
  that exists
- **THEN** the skill SHALL run the same search, why it exists, spec, build and proof
  order and SHALL require the fresh-session check before the task is done

### Requirement: Skill authoring standards

The plugin SHALL offer a skill that states the quality bar for any prompt
written here, a skill, an agent or a command. A skill SHALL open with its
purpose (the gap, who it serves, the outcome, what is out of scope), carry a
description under 1,024 characters that names when it triggers and
disambiguates it from neighbouring skills, give each rule its reason, and end
with a Red flags section and a Say it in the reply section, with each sentence
in exactly one of the body, Red flags, or Say it. A skill SHALL stay under the
size cap, hold one subject, and carry no references directory.

#### Scenario: A skill description is ambiguous

- **WHEN** two skills' trigger descriptions could both match the same
  request
- **THEN** the standard SHALL flag the overlap so the developer
  disambiguates before shipping either skill

#### Scenario: A skill body is oversized or carries references

- **WHEN** a skill body exceeds the size cap, or carries its own
  references directory
- **THEN** the standard SHALL flag it, since a skill holds one file and no
  references directory

#### Scenario: A skill is a list of prohibitions

- **WHEN** a skill states rules as capitalised prohibitions without a reason
- **THEN** the standard SHALL ask for the behaviour wanted and the reason
  beside each rule

### Requirement: Eval before a skill is kept

Every skill and agent SHALL ship evals under its plugin's `evals/`: a case
tagged `fire`, a case tagged `scenario` graded on the agent's thought process
and output in one to three points, and one `negative` case per plugin. A change
to a skill SHALL be kept only if its eval, run with `claude plugin eval`, does
not get worse; a skill whose scenario still passes without the plugin after it
was made harder SHALL be proposed for removal.

#### Scenario: The fire case fails

- **WHEN** a realistic prompt that should load the skill does not
- **THEN** the description SHALL be rewritten and the eval run again

#### Scenario: The scenario passes without the plugin

- **WHEN** a scenario passes in 2 of 3 runs without the plugin
- **THEN** the scenario SHALL be made harder, and if it still passes the
  skill SHALL be proposed for removal

### Requirement: Prompting reference

The plugin SHALL offer a skill that is the prompting guide of this
marketplace, loaded when writing or reviewing a prompt. It SHALL explain why
and what before how: why a prompt opens with its purpose, how to write and use
an iron law and how it is misused, and maker notes on where models over- or
under-do. It SHALL hold a per-model row only where this marketplace measured
it, and SHALL NOT be a per-model rewriting manual.

#### Scenario: A prompt is written for a named model

- **WHEN** a developer writes a prompt for one model
- **THEN** the skill SHALL give the rules every model shares and the purpose
  behind each, and a per-model line only when a measurement backs it

#### Scenario: An iron law is proposed

- **WHEN** a developer wants a rule that must hold every time
- **THEN** the skill SHALL say when an iron law fits, that it carries its
  reason, and how stating it as a prohibition without the reason misuses it

### Requirement: Plugin manifest validation on write

The plugin SHALL run a check every time an agent writes or edits a file
named `plugin.json`. The check SHALL confirm name is kebab-case, version
starts with a dotted triple of numbers, description is non-empty, author is
a string or an object naming one, keywords is an array of strings, and, when
a `hooks` key is present, that it is a string ending `.json` rather than
null. The check SHALL block the action and report every violation found when
any of these fail, and SHALL pass silently for a file not named
`plugin.json`.

#### Scenario: A manifest sets hooks to null

- **WHEN** an agent writes a `plugin.json` with `"hooks": null`
- **THEN** the check SHALL block the write and report that the key must be
  omitted rather than set to null

#### Scenario: A manifest passes every check

- **WHEN** an agent writes a `plugin.json` with a valid name, version,
  description, author, and keywords
- **THEN** the check SHALL pass without blocking

#### Scenario: An unrelated file is written

- **WHEN** an agent writes or edits a file not named `plugin.json`
- **THEN** the check SHALL exit without reporting anything

### Requirement: Marketplace lens

The plugin SHALL ship a `qsm-builder` binary whose verbs show the marketplace as one page and never
write a plugin file: `lens [dir] [--port]` serves the page on 127.0.0.1 and turns a saved edit into
one task in the task tool, `lens export [dir] [--out]` writes the same page as one static HTML file,
`lens readme [dir] [--check]` writes the root README's generated block and two banners from the same
model, `lens pull <artifact-url>` turns the edits saved on the published page into tasks,
`lens tasks [plugin]` lists a plugin's open tasks with their stale state, `lens brief <file>` gives
what the agent is told about the plugin a file belongs to, `lens marketplace [--dir]` prints the
whole marketplace as a read model (its reason to exist, every plugin with its reason in one line,
its dependencies and its count of open tasks), `lens plugin <name>` prints one plugin as a read
model (why it exists, skills and agents with their descriptions, dependencies with their reasons,
open tasks), and `doctor` checks the binary runs and the task tool is reachable. The page SHALL open
a plugin with its README's `## Why it exists`, its dependencies with the reasons its spec gives, and
the open epics and tasks that name it; a skill or agent SHALL show its description, trigger words
and opening paragraph each with the file part it comes from, and its evals grouped by kind with the
last result apart from the editable fields. A directory with no `.claude-plugin/marketplace.json`
SHALL fail with `missing` naming that file.

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

### Requirement: Open tasks reach the agent

A function hook SHALL, the first time in a session a `Read`, `Write` or `Edit` of a file of a
plugin finishes, add the output of `lens brief` for that file to the context the model reads
after the tool's result, once per plugin per session. A call the tool refused or failed SHALL add
nothing and SHALL NOT count as the first. A failure of the verb SHALL toast and log its cause and
leave the tool's result as the tool made it.

#### Scenario: The first read of a plugin's file

- **WHEN** the agent reads a file of `qsm-web`, which has an open edit, and later another file of it
- **THEN** the result of the first read SHALL carry the plugin's open tasks as context, and the
  second SHALL carry none

#### Scenario: The task tool is missing under the hook

- **WHEN** the agent reads a file of a plugin and the task tool is not on `PATH`
- **THEN** a toast SHALL name `qsm-tasks` as the cause and the read SHALL return as it was

### Requirement: A marketplace and plugin view in a pane

The plugin SHALL register the slash command `/lens [plugin]`. Without a name it opens a pane that
draws the output of `lens marketplace`, with a plugin name the output of `lens plugin <plugin>`,
for the marketplace of the session's working directory, and it changes nothing. A press on a
plugin line of the first, or on a skill or agent line of the second, SHALL open the next level in
its own pane. A name the marketplace does not list, or a verb that fails, SHALL show the cause in
the pane.

#### Scenario: The person opens the marketplace

- **WHEN** the person runs `/lens`
- **THEN** a pane SHALL show the marketplace's why it exists and each plugin with one line, its
  dependencies and its open task count

#### Scenario: The person opens one plugin

- **WHEN** the person runs `/lens qsm-web`
- **THEN** a pane SHALL show that plugin's why it exists, its skills and agents with one line each,
  its dependencies with reasons and its open tasks, and no key SHALL edit anything

#### Scenario: The person exports the marketplace

- **WHEN** the person runs `qsm-builder lens export` in a marketplace
- **THEN** one HTML file SHALL be written with an overview and one tab per plugin, and no plugin
  file SHALL change

#### Scenario: Edits wait on the published page

- **WHEN** the person saved two edits on the published artifact and runs
  `qsm-builder lens pull <url>`
- **THEN** two tasks SHALL be made, both rows marked taken, and a second pull SHALL make none

#### Scenario: The exported page opened from disk

- **WHEN** the exported page runs with no artifact database
- **THEN** its pens SHALL stay hidden and the page SHALL say it is read-only and where edits are
  made

#### Scenario: The task tool is not installed

- **WHEN** the task tool is not on `PATH` and the person runs `qsm-builder doctor`
- **THEN** the command SHALL exit `missing` and name `qsm-tasks` as what to install

### Requirement: Dependencies

qsm-builder SHALL declare `qsm-openspec` and `qsm-tasks` in the `dependencies` array of its
plugin.json, each for one reason:

- `qsm-openspec`: serves the spec port; add-plugin hands every addition to the spec flow, where
  its requirement and scenarios are written before the build.
- `qsm-tasks`: serves the task port; the lens reads a plugin's open tasks through it and makes
  one task for each edit saved on the page.

qsm-builder SHALL NOT depend on `qsm-essentials`: no skill, hook or verb of it calls one of the
core's skills.

#### Scenario: The spec port is installed with the plugin

- **WHEN** the plugin is installed
- **THEN** `claude plugin install` SHALL install `qsm-openspec` with it, because add-plugin is a
  skill with no code of its own that could fail

#### Scenario: The task port is missing

- **WHEN** qsm-tasks is not installed and `doctor` or `lens brief` runs
- **THEN** the command SHALL fail with `missing` and SHALL name qsm-tasks as what to install; the
  page, the export and `lens tasks` say the tasks were not read and go on
