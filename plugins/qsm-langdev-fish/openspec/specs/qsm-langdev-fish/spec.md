# qsm-langdev-fish Specification

## Purpose

qsm-langdev-fish exists because a model left alone writes fish as if it were bash. Its skill keeps
only the caveats a model gets wrong while it writes or edits fish, the traps that bite when a bash
or zsh habit is transplanted into fish.

## Requirements

### Requirement: Dependencies

qsm-langdev-fish SHALL declare these plugins in the `dependencies` array of its plugin.json:

- `qsm-langdev`: the checkers and the gate profile for `.fish` files live in qsm-langdev, so
  installing the language brings its gate.

#### Scenario: Installing the plugin

- **WHEN** the plugin is installed
- **THEN** claude plugin install installs qsm-langdev with it

### Requirement: The fish-dev skill triggers on fish work

The fish-dev skill SHALL trigger when an agent writes or edits a fish script
or a fish config, or is asked how something works in fish, and SHALL produce
only the caveats a model gets wrong: the points where fish diverges from bash
or zsh, such as scoping, list indexing and unmatched globs. It SHALL NOT repeat
what a fish tutorial holds.

#### Scenario: Writing or editing fish code

- **WHEN** an agent is about to write or edit a `.fish` script or a fish config
- **THEN** the skill SHALL trigger and return the load-bearing fish rules
  before any code is written

#### Scenario: Asked about something fish does like bash

- **WHEN** the question is a bash script or a zsh script
- **THEN** the skill SHALL NOT trigger, because shell-dev and zsh-dev own those
