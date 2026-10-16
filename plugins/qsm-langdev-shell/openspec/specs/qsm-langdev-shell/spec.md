# qsm-langdev-shell Specification

## Purpose

qsm-langdev-shell exists to teach an agent the traps strict mode sets and the choices shellcheck
cannot decide, and the style a bash script is judged on. It ships the skill only; the checkers and
the gate profile live in qsm-langdev.

## Requirements

### Requirement: The shell-dev skill holds the traps shellcheck cannot decide

The plugin SHALL expose one skill, shell-dev, that activates when the task at
hand is writing, modifying, or explaining a Bash script. It SHALL hold, in its
body, only the traps strict mode sets and the choices shellcheck cannot make;
there is no reference tier to pull from.

#### Scenario: Writing a Bash script

- **WHEN** an agent is asked to write or modify a Bash script
- **THEN** the skill SHALL activate and SHALL present those traps directly

### Requirement: A Bash script starts with the portable shebang and prefers builtins

A Bash script written under this plugin SHALL start with `#!/usr/bin/env bash`.
It SHALL do its work with Bash builtins and parameter expansion before it calls
an external tool, and SHALL call an external tool only where no builtin does
the job.

#### Scenario: A script that trims and splits strings

- **WHEN** an agent writes a script that trims, splits, or tests strings
- **THEN** the script SHALL use parameter expansion, `[[ ]]` and `read` rather
  than `sed`, `awk`, `cut` or `expr`, and its first line SHALL be
  `#!/usr/bin/env bash`

### Requirement: Dependencies

qsm-langdev-shell SHALL declare each dependency in the `dependencies` array of its plugin.json,
with one reason:

- `qsm-langdev`: the language's checkers (shellcheck, shfmt) and gate profile live
  in qsm-langdev, so installing the language brings its gate.

#### Scenario: The plugin is installed

- **WHEN** the plugin is installed
- **THEN** claude plugin install installs qsm-langdev with it
