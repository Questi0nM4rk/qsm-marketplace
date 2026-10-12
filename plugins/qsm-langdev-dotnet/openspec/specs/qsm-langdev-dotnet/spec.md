# qsm-langdev-dotnet Specification

## Purpose

qsm-langdev-dotnet holds the C# choices the analyzers cannot make, what is newer than the model
knows, and the xUnit test idiom, in one skill. The C# profile and the gate that checks the result
are qsm-langdev's.

## Requirements

### Requirement: The dotnet-dev skill triggers on C#/.NET work

The plugin SHALL provide a skill that triggers when an agent writes or edits
C# code, or is asked how a C# language feature works. The skill SHALL hold only
the choices the analyzers cannot make and the features newer than the model
knows, in its body: there is no reference tier to pull from, and nothing the
model already writes correctly.

#### Scenario: Writing C# code

- **WHEN** an agent is about to write or edit a C# type, method, or async
  call
- **THEN** the skill SHALL surface the load-bearing idioms before the agent
  writes it

#### Scenario: A question with no file to edit

- **WHEN** an agent is asked how a C# language feature works, with no code
  change involved
- **THEN** the skill SHALL still trigger and answer from its content

### Requirement: C# tests are written in xUnit, and the idiom lives here

The dotnet-dev skill SHALL hold the C# test idiom (xUnit: Fact and Theory,
InlineData, arrange act assert, fixtures, async tests, test doubles, running
one test), because no general plugin carries a per-framework test skill.

#### Scenario: Writing a C# test

- **WHEN** an agent is about to write a test in a C# project
- **THEN** the skill SHALL surface the xUnit structure before the agent writes
  it, and no other plugin's skill SHALL be needed for the framework

### Requirement: Dependencies

The plugin SHALL declare `qsm-langdev` in the `dependencies` array of its plugin.json, for one
reason:

- `qsm-langdev`: the C# checkers and gate profile live there, so installing the language brings
  its gate.

The plugin ships a skill and no code, so it has no `missing` failure of its own. It SHALL NOT
duplicate qsm-langdev's install or doctor behaviour and SHALL claim no hooks, linter or type
checker of its own.

#### Scenario: The plugin is installed

- **WHEN** the plugin is installed
- **THEN** `claude plugin install` installs qsm-langdev with it

### Requirement: C# is navigated by symbols

In a project with this plugin installed, an agent SHALL be able to go to a symbol's definition, list
its references and implementations, and read the compiler's diagnostics for a file, through the
harness's language server tools rather than by text search. The skill SHALL name the harness's
language server tools for it and SHALL ship no server of its own.

#### Scenario: Renaming a method

- **WHEN** an agent is about to rename a method in a C# project
- **THEN** it SHALL obtain the list of callers from the language server before
  editing, and the diagnostics after
