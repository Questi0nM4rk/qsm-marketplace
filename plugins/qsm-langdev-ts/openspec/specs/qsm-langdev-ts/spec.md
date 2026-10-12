# qsm-langdev-ts Specification

## Purpose

qsm-langdev-ts ships two skills, typescript-dev and bun-dev. They add only what the model does not
do unprompted: our own types validated where data is mapped into them, the bun:test idiom, and the
caveats of the Bun runtime for a project that runs on Bun.

## Requirements

### Requirement: Dependencies

qsm-langdev-ts SHALL declare `qsm-langdev` in the `dependencies` array of its plugin.json, for
one reason:

- `qsm-langdev`: the TypeScript checkers and gate profile live in qsm-langdev, so installing the
  language brings its gate.

#### Scenario: The plugin is installed

- **WHEN** qsm-langdev-ts is installed
- **THEN** claude plugin install SHALL install qsm-langdev with it

### Requirement: The typescript-dev skill holds what the model does not do unprompted

qsm-langdev-ts SHALL trigger the typescript-dev skill when an agent is about
to write or explain TypeScript code, or asks how a language feature works. The
skill SHALL hold, in its body, only what the model gets wrong unprompted:
there is no reference tier to pull from, and nothing the compiler already
reports.

#### Scenario: Writing new TypeScript code

- **WHEN** an agent is about to write a TypeScript function or module
- **THEN** typescript-dev SHALL return the applicable idioms (narrowing, error
  handling, module conventions) before the agent writes the code

### Requirement: Domain values are our own types, validated where data is mapped into them

typescript-dev SHALL direct an agent to give a value that has rules its own
type, and to validate the rule once, at the place where outside data is mapped
into that type, so that code past that boundary holds a value that cannot be
invalid. A loose string or number SHALL NOT carry a domain meaning past the
boundary.

#### Scenario: A value with a rule arrives from outside

- **WHEN** an agent writes code that reads an email address, an identifier or
  an amount from JSON, the environment or a request
- **THEN** it SHALL define its own type for the value and parse it into that
  type at the mapping, failing there with a named error when the rule is broken

### Requirement: Tests are written in bun:test, and the idiom lives here

typescript-dev SHALL hold the TypeScript test idiom (bun:test: describe and
it, hooks, parameterized cases, async, mocks, running one test), because no
general plugin carries a per-framework test skill.

#### Scenario: Writing a TypeScript test

- **WHEN** an agent is about to write a test in a TypeScript project
- **THEN** typescript-dev SHALL surface the bun:test structure before the
  agent writes it

### Requirement: Bun caveats ride only with a Bun project

The bun-dev skill SHALL hold only the Bun runtime caveats a model gets wrong
(calls that stall a server, install-script trust, build targets), and SHALL
trigger only when the project's runtime is Bun. A project on another runtime
SHALL NOT carry Bun's caveats.

#### Scenario: A Bun-specific runtime question

- **WHEN** an agent in a Bun project asks how to spawn a process, serve HTTP,
  or build with Bun
- **THEN** bun-dev SHALL return the matching caveat and typescript-dev SHALL
  NOT be the one to answer it

#### Scenario: A project that does not run on Bun

- **WHEN** an agent writes TypeScript in a project whose runtime is Node
- **THEN** bun-dev SHALL NOT trigger
