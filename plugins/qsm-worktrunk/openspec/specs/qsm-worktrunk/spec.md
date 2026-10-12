# qsm-worktrunk Specification

## Purpose

qsm-worktrunk gives an engineer or an agent isolated, branch-named workspaces for parallel
development, so per-phase work never drifts on a manually tracked path.

## Requirements

### Requirement: The `wt` binary is verified before the plugin is trusted

The plugin SHALL require `wt` on the operator's PATH, installed through the
platform's own package manager, and SHALL NOT vendor the binary itself.

#### Scenario: Doctor check confirms the binary

- **WHEN** the operator runs the plugin's doctor check
- **THEN** it SHALL report healthy only if `wt` resolves on PATH and returns its
  version, and SHALL report unhealthy otherwise

### Requirement: The worktrunk skill guides configuration and troubleshooting

The worktrunk skill SHALL activate when the agent is asked to configure `wt`
behavior: project or personal configuration, workflow hooks, commit-message
generation, or diagnosing a `wt` failure. It SHALL produce a concrete
configuration change or diagnosis, not an explanation alone.

#### Scenario: Team-wide automation requested

- **WHEN** the user asks for tests or dependency installs to run automatically
  around workspace switches or merges
- **THEN** the skill SHALL edit the project's own worktree configuration
  directly, since it is versioned and reversible by revert

#### Scenario: Personal configuration requested

- **WHEN** the user asks to change their personal `wt` defaults, such as
  commit-message generation or path templates
- **THEN** the skill SHALL propose the change and SHALL NOT write it until the
  user approves, since personal configuration cannot be recovered through git

#### Scenario: A workflow hook needs approval in a non-interactive session

- **WHEN** a project hook is not yet approved and the session cannot prompt for
  approval interactively
- **THEN** the skill SHALL tell the user to grant the approval themselves and
  SHALL NOT bypass it on the user's behalf

### Requirement: Raw git worktree commands are blocked in favor of `wt`

Before a git worktree subcommand runs, the plugin SHALL deny it and name the
`wt` equivalent, because `wt` addresses a workspace by branch name with a
computed path while raw git leaves the caller to track the path itself.

#### Scenario: Agent attempts to add a workspace with raw git

- **WHEN** the agent runs a `git worktree add` command
- **THEN** the command SHALL be denied with a message naming `wt switch
  --create` as the replacement

### Requirement: Every prompt carries the current workspace's identity

When the working directory sits inside an isolated workspace rather than the
main checkout, the plugin SHALL attach that workspace's name, path, and current
branch to the next turn's context, so the agent never has to ask which
workspace it is in.

#### Scenario: Working from the main checkout

- **WHEN** the current directory is the repository's main checkout, not an
  isolated workspace
- **THEN** no workspace context SHALL be attached

### Requirement: Session activity is signaled through a shared marker

The plugin SHALL set a visible marker while the agent is working or waiting on
the user, and SHALL clear it when the session ends, so a shell prompt or status
line reflects the agent's state without polling.

#### Scenario: A new turn starts

- **WHEN** the user submits a prompt
- **THEN** the marker SHALL be set to the working state

#### Scenario: The agent needs the user's attention

- **WHEN** the harness raises a notification to the user
- **THEN** the marker SHALL be set to the waiting state

#### Scenario: The session ends

- **WHEN** the session terminates
- **THEN** the marker SHALL be cleared

### Requirement: Creating an isolated workspace goes through `wt`

When the harness needs a new isolated workspace for a branch, the plugin SHALL
create or reuse it through `wt switch --create <branch> --base <current
branch>` and SHALL return the path `git worktree list` reports for that
branch, rather than the harness computing a path itself or the plugin reading
one out of `wt`'s text. When `wt` fails, or exits clean and git lists no
worktree on the branch, the plugin SHALL fail the request naming the command
and its last output line; it SHALL NOT fall back to a workspace `wt` does not
know.

#### Scenario: A workspace is requested for a branch name

- **WHEN** the harness asks for an isolated workspace for a given branch
- **THEN** the plugin SHALL create or reuse the workspace for that branch
  through `wt`, off the branch the session is on, and SHALL return the path
  git lists for it

#### Scenario: wt refuses

- **WHEN** `wt switch` exits non-zero
- **THEN** the request SHALL fail with the `wt` command and its last line, and
  no workspace SHALL be created another way

### Requirement: An isolated workspace shares the main checkout's task store

When the plugin creates an isolated workspace, it SHALL point the workspace at the main
checkout's task tool store, so that the ready list is the same in every workspace and nothing
is merged back.

#### Scenario: A task is created inside a workspace

- **WHEN** the agent creates a task while working in an isolated workspace
- **THEN** the task SHALL appear in the main checkout's ready list without any merge step

### Requirement: Removing an isolated workspace goes through `wt`

When the harness is done with an isolated workspace, the plugin SHALL resolve
the branch checked out at that path from `git worktree list` and remove it
through `wt remove <branch>` in the foreground: the workspace goes, and the
branch goes with it only when it holds nothing unmerged (wt's default). The
plugin SHALL NOT force-delete a branch. A path git lists no branch for SHALL
fail the request.

#### Scenario: A workspace is torn down

- **WHEN** the harness asks to remove a given workspace
- **THEN** the plugin SHALL remove that workspace through `wt` without
  prompting, and the branch with it when nothing on it is unmerged
