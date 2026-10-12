# qsm-langdev-py Specification

## Purpose

qsm-langdev-py ships the python-dev skill, which adds only what the agent gets wrong on typing and
clean code when it writes with no extra instructions, plus the pytest test idiom. It ships no hooks
and no bin; the Python checkers and gate profile live in qsm-langdev, which it depends on.

## Requirements

### Requirement: The python-dev skill triggers on Python work

The plugin SHALL provide a skill that triggers when an agent writes or edits
Python code, or is asked how a Python feature or tool works. The skill SHALL
hold only what the agent's unprompted Python gets wrong on typing and clean
code, in its body: there is no reference tier to pull from.

#### Scenario: Writing Python code

- **WHEN** an agent is about to write or edit a Python function
- **THEN** the skill SHALL surface the annotation, typing, and mutability rules
  before the agent writes it

#### Scenario: A question with no file to edit

- **WHEN** an agent is asked how a Python language or tooling feature works,
  with no code change involved
- **THEN** the skill SHALL still trigger and answer from its content

### Requirement: Python tests are written in pytest, and the idiom lives here

The python-dev skill SHALL hold the Python test idiom (pytest: fixtures,
parametrize, tmp_path, monkeypatch, running one test), because no general
plugin carries a per-framework test skill.

#### Scenario: Writing a Python test

- **WHEN** an agent is about to write a test in a Python project
- **THEN** the skill SHALL surface the pytest structure before the agent
  writes it

### Requirement: Dependencies

The plugin SHALL declare each dependency in the `dependencies` array of its plugin.json, with its
reason:

- `qsm-langdev`: the Python checkers and gate profile live in qsm-langdev, so installing the
  language brings its gate; the plugin SHALL NOT duplicate its install or doctor behaviour.

#### Scenario: Installing the plugin

- **WHEN** the plugin is installed
- **THEN** claude plugin install installs qsm-langdev with it
