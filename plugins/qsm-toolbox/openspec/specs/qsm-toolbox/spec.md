# qsm-toolbox Specification

## Purpose

qsm-toolbox is the one place every agent learns which third-party command-line tools this machine
has.

## Requirements

### Requirement: The index is always in context

The skill's frontmatter description SHALL be the complete list of tools in two
groups, each entry the binary name followed by at most four words, and nothing
else besides a leading clause saying when to invoke. Adding a tool SHALL be one
entry here, and one body row only when it has a caveat. Every bin another qsm plugin ships SHALL be
listed in the second group, whether or not that plugin also ships a skill, an
agent, a hook, or an MCP server; an MCP server entry point SHALL NOT be listed,
because nobody invokes it.

#### Scenario: A fresh session

- **WHEN** any agent with the Skill tool starts a session where the plugin is
  enabled
- **THEN** every catalog entry SHALL be visible in its skill list without
  invoking anything, and `claude plugin details` SHALL report the always-on cost
  as the description alone

#### Scenario: An entry over the word cap

- **WHEN** an entry's parenthesis holds five or more words
- **THEN** the plugin's own test over every catalog entry SHALL fail

### Requirement: The body is one caveat per tool

The skill body SHALL hold one table of the tools that have a caveat of ours, a
binary and its caveat, and nothing else per tool: what a tool does is its own
help, and the install line is doctor's. A caveat SHALL be only what `--help`
cannot tell. A caveat caused by a local shell alias SHALL be fixed at the alias
and never recorded as a row. A tool with no caveat SHALL have no row.
The body SHALL stay under 8 KB.

#### Scenario: A tool with a caveat

- **WHEN** an agent reads the skill before running `ast-grep`
- **THEN** it SHALL find in one row that the alias `sg` is an unrelated system
  command

#### Scenario: A caveat caused by a local alias

- **WHEN** an agent's command fails because a shell alias shadows a tool's
  output
- **THEN** the alias SHALL be removed from the shell configuration, and the
  skill body SHALL hold no row for it

#### Scenario: A tool with nothing to add

- **WHEN** an agent looks for `mlr` in the body
- **THEN** it SHALL find no row, and `qsm-toolbox doctor` SHALL give its install
  line when it is missing

### Requirement: One installer walks the table

Install SHALL iterate the same table and install each tool that is not on PATH, through its own
package manager (`bun add -g`, `uv tool install`, `pipx install`, `go install`). A tool owned by a
system package manager (acli, comby, hurl, usql), and `br`, which qsm-tasks installs, SHALL be
suggested with its command, never run, and when the package manager that command assumes is not on
PATH the suggestion SHALL carry the row's alternative routes. `QSM_<TOOL>_SKIP=1` SHALL skip one
tool. A tool already present SHALL be reported as already installed. A tool installed by
`go install` SHALL be linked from the Go bin directory into the user's bin directory, replacing
whatever holds that name. The installer SHALL continue past one tool's failure and report every
result at the end.

#### Scenario: One failure among many

- **WHEN** `go` is missing and every other prerequisite is present
- **THEN** mlr, scc and yq SHALL be reported as missing-prereq with the
  prerequisite named, the rest SHALL install, and the exit code SHALL be non-zero

#### Scenario: A suggestion on another system

- **WHEN** hurl is missing and `pacman` is not on PATH
- **THEN** the suggestion SHALL name `pacman` as absent and carry the brew, dnf
  and cargo routes the row holds

#### Scenario: Dry run

- **WHEN** install runs with `--dry-run`
- **THEN** each tool SHALL be reported with the decision the real run would
  make, present or skipped or the command it would run or suggest, and nothing
  SHALL be executed

### Requirement: Doctor reports each tool

Doctor SHALL run each row's probe and print one line per tool, present with its
version or missing with its install command. Doctor SHALL exit zero: a toolbox
tool is optional, and the aggregate qsm-setup doctor decides what a missing one
means.

#### Scenario: Two tools missing

- **WHEN** hurl and usql are not on PATH
- **THEN** doctor SHALL print one present line per other tool, two missing lines each with
  its install command, and exit zero

### Requirement: Dependencies

qsm-toolbox SHALL declare no plugin dependency: it indexes tools, and nothing it ships calls
another plugin. The qsm CLIs listed in the second group are named for discovery only and SHALL NOT
be installed or probed here.

#### Scenario: A listed qsm CLI is absent

- **WHEN** a qsm CLI named in the second group is not on PATH
- **THEN** install and doctor SHALL say nothing about it, because each plugin installs and checks
  its own

### Requirement: The hooks module exposes the verbs

The plugin's hooks module SHALL register the `$.toolbox` noun generated from `qsm.json`, one method
per verb, and SHALL hold no logic of its own.

#### Scenario: A hook calls doctor

- **WHEN** a hook calls `$.toolbox.doctor()`
- **THEN** it SHALL receive the same report as `qsm-toolbox doctor`
