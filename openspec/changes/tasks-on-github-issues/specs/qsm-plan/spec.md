## ADDED Requirements

### Requirement: Every epic has acceptance criteria that the QA stage checks

The plan skill SHALL ensure an epic carries acceptance criteria written by grilling, each one a
thing a run can show, and SHALL NOT add a test-it task to the epic. When the epic is written it
SHALL be an issue of type `Epic` with Epic stage Planning. After its tasks are done, the QA agent
tests the whole epic against the business request and those criteria on the real path, and the
owner's acceptance closes the epic; the task tool's skill holds that flow.

#### Scenario: An epic is split

- **WHEN** the plan skill splits an epic into tasks
- **THEN** the set SHALL contain only pieces of the work and no test-it task

#### Scenario: An epic has no acceptance criteria

- **WHEN** the plan skill is asked to split an epic whose description holds no acceptance criteria
- **THEN** it SHALL hand back to grilling and SHALL NOT split the epic

## REMOVED Requirements

### Requirement: Every epic has acceptance criteria and a test-it task

**Reason**: The epic's final proof is the QA stage, not a task, so the criteria stay and the
test-it task goes.

**Migration**: "Every epic has acceptance criteria that the QA stage checks".
