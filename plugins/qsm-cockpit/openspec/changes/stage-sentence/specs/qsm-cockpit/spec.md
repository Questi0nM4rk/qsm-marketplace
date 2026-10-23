## MODIFIED Requirements

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
