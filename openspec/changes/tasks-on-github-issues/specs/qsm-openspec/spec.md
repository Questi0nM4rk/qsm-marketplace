## MODIFIED Requirements

### Requirement: A change has one task in the task tool, created with its spec

A change and its task are bound by the task's external reference
`openspec:<change-id>`. The task SHALL be created under the change's epic
through the task tool when the spec is written and never before: spec-propose
SHALL look the reference up first and, finding no task, SHALL create one
carrying the reference, the change name as its title, and the proposal's why as
its description, under the epic the change belongs to. tasks.md is the
developer's local breakdown of that one task, and subtasks SHALL NOT be created
in the task tool. spec-apply SHALL claim the task when implementation starts.
spec-propose SHALL record each changed decision as a comment on it.
spec-archive SHALL close it with a reason naming what was done unless the merge
of the change's pull request already closed it, SHALL close every other task
bound to the change the same way, and SHALL then check the epic's close rule
without closing the epic early. When the task tool is not reachable from the
repository (no GitHub remote, no login, no qsm-forge), spec-propose SHALL stop
before writing and name the cause, and SHALL NOT create the change unbound. The skills
SHALL say "the task tool" and "the spec tool" and never name a binary; the
plug-in that serves the task port holds the commands.

#### Scenario: A task already carries the reference

- **WHEN** a task whose external reference is `openspec:<change-id>` exists
  when spec-propose runs
- **THEN** spec-propose SHALL bind the change to that task and SHALL NOT
  create a second one

#### Scenario: No task carries the reference

- **WHEN** no task carries `openspec:<change-id>` when spec-propose runs
- **THEN** spec-propose SHALL create one with that reference under the epic
  when the spec is written

#### Scenario: tasks.md stays local

- **WHEN** spec-propose writes the breakdown of a change
- **THEN** every line SHALL live in tasks.md and none SHALL become a task in
  the task tool

#### Scenario: The task tool is not reachable

- **WHEN** the repository has no GitHub remote or the person is not logged in
- **THEN** spec-propose SHALL stop, name the cause, and SHALL NOT write the
  change

#### Scenario: Archive closes the task

- **WHEN** spec-archive archives a change whose bound task is still open
- **THEN** the bound task SHALL be closed with a reason naming what was done

#### Scenario: Archive closes the other bound tasks

- **WHEN** spec-archive archives a change that has further tasks bound to it
- **THEN** each of them SHALL be closed with a reason naming what was done

#### Scenario: The merge already closed the task

- **WHEN** spec-archive archives a change whose pull request, merged with `Closes #N`, closed the
  bound task
- **THEN** spec-archive SHALL leave it as it is and SHALL close only the other bound tasks
