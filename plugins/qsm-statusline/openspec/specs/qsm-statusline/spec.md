# qsm-statusline Specification

## Purpose

Replaces Claude Code's plain status line with one that shows, at a glance, the active model, context
window usage, subscription rate limits, and the current repository's git state.

## Requirements

### Requirement: The status line shows session and repository state at a glance

The status line SHALL render, on every prompt, the active model name, tokens
used against the context window, the session (five-hour) and weekly
subscription rate limits when the account has them, and the current
directory's git state. A source that is unavailable SHALL be omitted from the
render rather than shown as an error, and the render SHALL always complete
successfully.

#### Scenario: Full state available

- **WHEN** the account has subscription rate limits and the current directory
  is a git repository
- **THEN** the status line SHALL show model, context usage, both rate limit
  bars, and git counters for staged, modified, untracked, and conflicting
  paths, or "clean" when there are none

#### Scenario: A source is unavailable

- **WHEN** the current directory is not a git repository, or the account
  carries no subscription rate limits
- **THEN** the status line SHALL omit that segment and SHALL NOT render an
  error in its place

#### Scenario: Nothing blocks the render

- **WHEN** a value normally requires a slow external lookup
- **THEN** the status line SHALL render immediately using the last known value
  for that segment, without waiting on the lookup

### Requirement: The setup-statusline skill installs and updates the status line

The setup-statusline skill SHALL trigger when the user asks to install,
update, fix, or configure the status line. It SHALL produce a single
installed script plus a status-line configuration entry, and SHALL report one
of: installed, already up to date, or a failure with its cause. Updating and
installing SHALL be the same action. The skill SHALL tell the user to restart
Claude Code afterward, since the status line is read once at startup.

#### Scenario: Fresh install

- **WHEN** no status line is configured yet
- **THEN** the skill SHALL place the script, wire the configuration entry, and
  report installed

#### Scenario: Already up to date

- **WHEN** the installed script and configuration already match what the
  skill would install
- **THEN** the skill SHALL change nothing and report already up to date

#### Scenario: Required binary missing

- **WHEN** a binary the script depends on is not on PATH
- **THEN** the skill SHALL install nothing and report the missing binary by
  name

#### Scenario: Configuration file is unreadable

- **WHEN** the user's Claude Code configuration file is not valid JSON
- **THEN** the skill SHALL leave it untouched and report the failure, never
  overwriting it

#### Scenario: User asks to remove the status line

- **WHEN** the user asks to remove or uninstall the status line
- **THEN** the skill SHALL tell them which file to delete and which
  configuration entry to remove, and SHALL NOT delete or edit anything itself

### Requirement: The binary exposes render, refresh and doctor

The `qsm-statusline` binary SHALL provide three verbs. `render` SHALL read the harness payload on
stdin and print the status line. `refresh` SHALL recompute one directory's cached git state, and
`render` SHALL start it behind the frame. `doctor` SHALL report whether the binary is on PATH and
whether the settings file runs it, and print the entry that wires it.

#### Scenario: Render completes without a git state

- **WHEN** `render` runs in a directory whose git state is not cached yet
- **THEN** it SHALL print the other segments at once and start `refresh` behind the frame

#### Scenario: Settings file is unreadable

- **WHEN** `doctor` reads a settings file that is not valid JSON
- **THEN** it SHALL report `unreadable` with the cause and SHALL NOT modify the file

### Requirement: Dependencies

The plugin SHALL declare no dependencies, because it reads the harness payload and runs git
itself.

#### Scenario: Nothing else installed

- **WHEN** no other qsm plugin is installed
- **THEN** the status line SHALL render in full
