# qsm-langdev-zsh Specification

## Purpose

qsm-langdev-zsh tells qsm-langdev that the project speaks zsh, and its one skill holds only the
places where zsh silently differs from bash while an agent writes or edits zsh scripts and
configs.

## Requirements

### Requirement: Dependencies

qsm-langdev-zsh SHALL declare `qsm-langdev` in the `dependencies` array of its plugin.json, for
one reason, and SHALL NOT install without it:

- `qsm-langdev`: the gate that checks the zsh the skill teaches; it carries the zsh profiles and
  checkers this plugin only names.

#### Scenario: qsm-langdev is missing

- **WHEN** a user installs qsm-langdev-zsh and qsm-langdev is not installed
- **THEN** it SHALL fail with `missing` and SHALL name qsm-langdev as what to install

### Requirement: The zsh-dev skill triggers on zsh work

The zsh-dev skill SHALL trigger when an agent writes or edits a zsh script or
config, or is asked how something works in zsh, and SHALL produce only the
places where zsh silently differs from bash, such as fatal unmatched globs,
word splitting, array indexing, expansion flags and glob qualifiers. It SHALL
NOT repeat the shell's manual.

#### Scenario: Writing or editing zsh code

- **WHEN** an agent is about to write or edit a `.zsh` script or a zsh config
- **THEN** the skill SHALL trigger and return the load-bearing zsh rules
  before any code is written

#### Scenario: Unrelated work

- **WHEN** an agent works on a task that involves no zsh
- **THEN** the skill SHALL NOT trigger
