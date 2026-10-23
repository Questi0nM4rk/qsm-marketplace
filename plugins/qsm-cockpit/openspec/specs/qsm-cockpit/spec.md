# qsm-cockpit Specification

## Purpose

qsm-cockpit shows the person where the loop stands: the step the main chat said, the agents that
run with their model tier and the command each runs now, the claimed tasks, and the decisions of
the session. It records everything as it happens in the session's state, so the pane shows the
whole session whenever it opens.

## Requirements

### Requirement: The agent says its step with the stage tool

The plugin SHALL register a tool `stage`, listed in the prompt's tools, with `stage` one of LOAD,
PLAN, EXECUTE, VERIFY, LEARN and CLOSE, and an optional `doing` of a few words. A call from the
main chat SHALL make that step the chat's current one; the same step said again SHALL only replace
its `doing`. A call from a subagent SHALL set that agent's step and leave the chat's alone. The
answer SHALL be one sentence: the step, what to do in it, what to output, the tools for it, for
each skill that owns the step an instruction to load it when it is not loaded, and the next step.
LEARN SHALL name no skill until one owns it. The answer SHALL NOT carry a skill's text. A step
outside the six SHALL be an error naming the six. The plugin SHALL NOT infer a step from any other
tool call.

#### Scenario: The chat moves back after a failed check

- **WHEN** the main chat calls `stage` with VERIFY, then with EXECUTE
- **THEN** the band shows EXECUTE on the blue chip, and the answer names VERIFY as the next step

#### Scenario: Each answer is one sentence that names its skill

- **WHEN** the main chat calls `stage` with EXECUTE
- **THEN** the answer is one sentence that names what to do, what to output, the tools, and tells
  the agent to load `qsm-openspec:spec-apply` and `qsm-essentials:subagents` if they are not loaded

#### Scenario: A switch back gets the same short sentence

- **WHEN** the main chat calls `stage` with LOAD, EXECUTE, VERIFY, EXECUTE, VERIFY
- **THEN** every answer is one sentence of the same size for the same stage, and none carries a
  skill's text

#### Scenario: A subagent says its step

- **WHEN** a running agent calls `stage` with LOAD
- **THEN** its row shows LOAD, and the chat's step is unchanged

#### Scenario: A step that does not exist

- **WHEN** the tool is called with SHIP
- **THEN** it answers an error that names the six steps, and no state changes

### Requirement: Every prompt carries where the chat stands

A `prompt.submit` hook SHALL add one line of context to every prompt: the step the chat said, how
long ago, its `doing`, and the next step; or, when no step was said, that the stage tool waits for
the first one. A failure of the hook SHALL let the prompt through unchanged.

#### Scenario: The first prompt of a session

- **WHEN** the person types the first prompt
- **THEN** the context says the step is not said yet and asks for the stage tool

### Requirement: The band shows the step and the running agents

A `ui.render` hook on `AbovePrompt` SHALL draw the six steps in one line, the current one on a blue
chip, under it the chat's `doing`, and one row per running agent: its tier on a chip in the tier's
colour (haiku green, sonnet cyan, opus magenta, fable yellow), its description, its step when it
said one, the command it runs now said short or `thinking` between commands, and how long it has
run. A finished agent SHALL NOT be in the band. The band SHALL NOT show the main chat's commands,
because the transcript shows them. A row SHALL stay one line high however long its text is.

#### Scenario: Two agents run

- **WHEN** a haiku and a sonnet agent run, and the haiku one runs
  `cd /tmp && (sleep 30) 2>&1 | tee x.log`
- **THEN** the band has a green and a cyan row, and the haiku row says `Bash sleep 30`

#### Scenario: An agent finishes

- **WHEN** an agent's turn completes
- **THEN** its row leaves the band

### Requirement: The pane shows the whole session

`/cockpit` SHALL open a pane of cards: Chat (working or idle, the step line and the `doing`),
Agents (the running ones with their command, the finished ones behind a dropdown, newest first,
with how each ended and how long it ran), Tasks (the claimed tasks and how many were closed in this
session), and Decisions (one dropdown per typed prompt that questions answered, titled by the
prompt, holding each `question` and its `answer`). Every hook SHALL record into the session's
state whether the pane is open or not, so the pane opened late shows the session since the plugin
loaded.

#### Scenario: The pane opens late

- **WHEN** two agents ran and a question was answered before `/cockpit` was typed
- **THEN** the pane shows both agents under the finished dropdown and the answer under its prompt

#### Scenario: Decisions under their prompt

- **WHEN** the person typed "make a cockpit mod" and then answered two questions
- **THEN** the Decisions card has one closed dropdown "make a cockpit mod (2)", and pressing it
  shows both questions with their answers

### Requirement: An observer never blocks

Every hook on `tool.call` and `agent.spawn` SHALL pass the call on when it fails, because a display
that refuses a tool call or an agent breaks the work it only watches. Each such failure, and the
one of the prompt hook, SHALL first toast `qsm-cockpit ERROR: <event>: <reason>`.

#### Scenario: The state write fails

- **WHEN** recording an agent's command throws
- **THEN** the command runs as if the plugin were not installed

### Requirement: Dependencies

qsm-cockpit SHALL declare `qsm-tasks` in the `dependencies` array of its plugin.json, for one
reason:

- `qsm-tasks`: serves the task port; the Tasks card reads the claimed tasks from the task tool in
  the session's directory and refreshes after each task-tool command of the main chat.

#### Scenario: The task port is missing

- **WHEN** the task tool is not on PATH or the directory has no tracker
- **THEN** the Tasks card keeps what it had and the plugin toasts `qsm-cockpit ERROR: tasks:` with
  the cause and logs it

### Requirement: One verb answers the claimed tasks

The plugin SHALL ship the binary `qsm-cockpit` with the verb `tasks`, which runs the task tool's
list of in-progress tasks in the working directory and answers each task's `id` and `title`; the
hooks module SHALL read the Tasks card through `$.cockpit.tasks()` and never run the task tool
itself. A task tool that cannot run SHALL be `missing` naming `qsm-tasks`, and one that exits
non-zero SHALL be `failed` with its exit code.

#### Scenario: A directory without a tracker

- **WHEN** `qsm-cockpit tasks` runs where the task tool exits non-zero
- **THEN** it exits with the `failed` code and the message holds the task tool's exit code
