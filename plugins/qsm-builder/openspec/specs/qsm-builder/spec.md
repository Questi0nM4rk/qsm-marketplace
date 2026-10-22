# qsm-builder Specification

## Purpose

qsm-builder helps a developer extend this marketplace.

## Requirements

### Requirement: Plugin scaffolding and content placement

The plugin SHALL offer a skill, add-plugin, for adding a whole new plugin or deciding whether a
request is a new plugin or content in one that exists. For any addition it SHALL search the
marketplace for the same concept before writing anything, and SHALL edit an existing owner in
place rather than duplicate it. For a new plugin it SHALL require a README opening with its
why-it-exists section written before the specification, a specification written before the build,
a `plugin.json` without `version`, an install script built on the shared install base, and each
dependency written in the manifest and in the spec. It SHALL hand each part to its own builder
skill (add-tool, add-hook, add-skill, add-lib), carry hard rules each naming its gate or review,
and define done as the repository gates, the kind's own proof and a strict-reviewer review.

#### Scenario: Developer asks for a new capability

- **WHEN** a developer asks to add a capability that has no plugin yet
- **THEN** the skill SHALL search first, write why it exists and the spec before the build, and
  SHALL NOT call the work done until the gates and the review pass

#### Scenario: The concept already has a home

- **WHEN** a developer asks to add content whose concept already exists
  under a different name elsewhere in the marketplace
- **THEN** the skill SHALL edit the existing document in place instead of
  creating a new one

#### Scenario: A part of an existing plugin

- **WHEN** a developer asks to add a hook, a skill or a CLI verb to a plugin that exists
- **THEN** the skill SHALL name the builder skill that owns that part

### Requirement: Building a CLI verb

The plugin SHALL offer a skill, add-tool, for adding a CLI bin or a verb. It SHALL require the verb
declared in `qsm.json` and handled through `runCli`, its failures as `fail` or a thrown `QsmError`,
its environment read through `lib/paths.ts`, the generated noun refreshed with the manifest, and a
test that drives the real binary through `runBin` and `isolatedEnv` with temp dirs from
`sandboxDir`. It SHALL carry hard rules each naming its gate or review, and define done as the
repository gates, one real run of the verb and a strict-reviewer review.

#### Scenario: A test spreads the whole environment

- **WHEN** a developer offers a CLI test that spreads `process.env` into the child or makes its own
  temp dir
- **THEN** the skill SHALL refuse it and name `isolatedEnv` and `sandboxDir` as the replacement

### Requirement: Building a hook

The plugin SHALL offer a skill, add-hook, for adding a hook. It SHALL require the logic in a verb
of the hook's own plugin and the hook as one call of its noun, every `.catch` calling the
generated `failure()` before its policy, no listener on the events the engine skips under managed
settings, a classic command hook only for an event with no function form, and a hooks test run
through `claude plugin test`. It SHALL define done as the repository gates, `bun run test:hooks`,
a real run of the verb and a strict-reviewer review.

#### Scenario: Logic sits in a hook

- **WHEN** a developer asks to add a hook whose rule is written inside the hooks module
- **THEN** the skill SHALL move the rule into a verb of the plugin, have the hook call it, and
  require `failure()` in its `.catch` and the hooks test before done

### Requirement: Building a skill, agent or command

The plugin SHALL offer a skill, add-skill, for adding a skill, an agent or a command to a plugin
that exists. It SHALL search for an existing owner before writing, choose the file kind, require the
eval cases (fire, behaviour, negative) before the body, and carry numbered hard rules each with its
reason and its enforcing gate or "review". It SHALL define done as the repository gates, the
plugin's eval and a strict-reviewer review of the diff with those rules as the checklist, and it
SHALL point to the skill-standards skill for the quality bar instead of repeating it.

#### Scenario: A developer asks for a new skill

- **WHEN** a developer asks to add a skill to a plugin
- **THEN** the skill SHALL plan the eval cases with the skill, and SHALL NOT call the work done
  until the gates, `bun run eval <plugin>` and the review pass

### Requirement: Adding to the shared kit

The plugin SHALL offer a skill, add-lib, for code that is about to go into root `lib/` or
`lib/fixtures/`. It SHALL accept a new export only in the change that deletes at least two plugin
copies of it, SHALL require a helper a plugin could copy to be registered with the private-helper
gate and in the AGENTS.md layout, and SHALL keep `lib/` free of plugin names, plugin imports and
npm packages. It SHALL define done as the repository gates, a shortstat whose deletions exceed its
additions and a strict-reviewer review.

#### Scenario: A helper with one consumer

- **WHEN** a developer asks to move a helper that one plugin uses into `lib/` for later
- **THEN** the skill SHALL refuse it and say the export lands with the deletion of two copies

#### Scenario: Two plugins share a helper

- **WHEN** two plugins each define the same helper
- **THEN** the skill SHALL move it to `lib/`, delete both copies, register it with the
  private-helper gate and the layout, and show the shortstat

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
named `plugin.json`. The check SHALL confirm name is kebab-case, version,
when present, starts with a dotted triple of numbers, description is non-empty, author is
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
last result apart from the editable fields. The served page SHALL be small and navigable: `/` SHALL
hold the overview and `/p/<plugin>` one plugin, so a request never carries the other plugins, and an
unknown plugin SHALL answer 404; the page SHALL have exactly one `h1`, each panel titling itself at
`h2`; the plugin and skill links SHALL be plain links marking the current one with `aria-current`,
with a skip link to the content; a plugin's page SHALL show, each in its own section, its reason to
exist, its skills and agents (description, trigger words, opening), its hooks by event, its CLI
verbs, its spec requirements with their count of scenarios, its eval cases with the last result, its
open tasks and its dependencies; the page SHALL keep a 16 px gutter at phone width, give a card's
text at least 320 px of a 390 px screen, keep its plugin navigation to one horizontally scrolling
row, and draw trigger words as plain quoted tags that look unlike links and buttons; it SHALL
request nothing outside 127.0.0.1, its fonts being the system's. The export and the artifact keep
every panel in one document. A directory with no `.claude-plugin/marketplace.json` SHALL fail with
`missing` naming that file.

#### Scenario: The person exports the marketplace

- **WHEN** the person runs `qsm-builder lens export` in a marketplace
- **THEN** one HTML file SHALL be written with an overview and one tab per plugin, and no plugin
  file SHALL change

#### Scenario: One plugin per request

- **WHEN** a browser opens `/p/qsm-builder` on a served lens
- **THEN** the page SHALL hold that plugin's panels and one `h1`, `/` SHALL hold the overview, and
  `/p/nope` SHALL answer 404

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
