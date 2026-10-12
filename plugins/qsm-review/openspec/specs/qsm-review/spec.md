# qsm-review Specification

## Purpose

qsm-review reviews a code change against one strict, single-tier standard, at depths the caller
chooses (a solo pass, a posted pull or merge request review, a readability score), and holds the
rules for answering findings and for release readiness.

## Requirements

### Requirement: A solo review applies one review tier and never posts

The plugin SHALL run a one-agent review, through the `strict-reviewer` agent, of a diff, a branch, a
PR/MR reference, or a path set, treating every finding as a required change: zero findings is
approval, any finding is a request for changes, with no partial approval and no severity grading.
The reviewer SHALL report every finding it can support after re-reading each as a skeptic, with no
severity gate, and the plugin SHALL relay every surviving finding, each carrying the code path that
reaches it, and SHALL NOT send the review to any forge or external service. The plugin SHALL name
the next step of the qsm flow with its result: received-findings after a review that has findings,
and spec-archive after an approval.

#### Scenario: A small diff is reviewed

- **WHEN** the caller asks for a quick review and names no target
- **THEN** the plugin SHALL pin the diff against the merge base of the
  default branch, confirm it is non-empty, and return every finding with its
  code path, naming received-findings as the next step

#### Scenario: No findings

- **WHEN** the review completes and finds nothing to change
- **THEN** the verdict SHALL be approve and the plugin SHALL name spec-archive
  as the next step

#### Scenario: The diff is empty

- **WHEN** the pinned diff has no changes
- **THEN** the plugin SHALL say so and SHALL NOT produce a review

#### Scenario: The change outgrows a solo pass

- **WHEN** the review judges the change too large or too risky for one agent
- **THEN** the plugin SHALL say so and stop rather than present a shallow
  pass as full coverage

### Requirement: Workflow review posts a strict review under the caller's own account

The plugin SHALL run a difficulty-scaled, multi-agent review of one GitHub
pull request or GitLab merge request and SHALL post the result using the
caller's own forge identity, never a bot account.

#### Scenario: A PR/MR is reviewed end to end

- **WHEN** the caller names a pull request or merge request number
- **THEN** the plugin SHALL assemble the review context, run the review, and
  post it under the caller's own account

#### Scenario: No forge authentication

- **WHEN** the caller is not authenticated with the forge the target belongs
  to
- **THEN** the plugin SHALL tell the caller and SHALL NOT attempt the review

#### Scenario: A scheduled rerun finds unanswered review threads

- **WHEN** an automated rerun fires after the reviewed head moves and open
  threads still await the author's reply
- **THEN** the plugin SHALL skip the run rather than post again; a rerun the
  caller asked for directly SHALL proceed regardless

#### Scenario: The caller asks for a dry run

- **WHEN** the caller asks not to post
- **THEN** the plugin SHALL run the same review and report the result in
  chat only, posting nothing

### Requirement: Readability score through the review skill

The review skill SHALL, when asked whether a codebase or a skill is readable,
dispatch the readability reviewer and relay its six dimensions (folder
navigation, architecture clarity, code self-documentation, test clarity,
onboarding friction, overall communication) and the 1-10 score.

#### Scenario: Scoring a codebase for a fresh reader

- **WHEN** an agent is asked whether a codebase or a skill is readable, or to
  score it for clarity
- **THEN** the skill SHALL dispatch the readability reviewer and SHALL return
  the six-dimension breakdown and the 1-10 score, not a single unstructured
  opinion

### Requirement: Readability reviewer agent

The plugin SHALL provide a read-only agent that scans a codebase or a skill as
a fresh reader and returns a structured six-dimension readability assessment
with a 1-10 score, and SHALL NOT propose fixes or perform deep analysis beyond
that measurement.

#### Scenario: Baselining readability after a refactor

- **WHEN** an agent needs a readability baseline before or after a refactor, or
  a first-impression pass on unfamiliar code
- **THEN** the reviewer SHALL return the six-dimension score and SHALL NOT
  return remediation suggestions

### Requirement: A received finding is verified before it is implemented

When an agent receives review findings, whether from a human, from the
workflow review, or from a reviewing subagent, the agent SHALL verify each
finding against the code before changing anything, and SHALL implement a
finding only when that verification confirms it. The agent SHALL answer a
finding it refutes with the evidence that refutes it and SHALL leave the code
unchanged for that finding. The agent SHALL NOT agree with a finding in order
to look agreeable. A reviewer's suggestion that adds scope beyond the change
under review SHALL be treated as a question for the user, not as work. Once
the confirmed findings are fixed, the agent SHALL name spec-archive as the
next step.

#### Scenario: The finding names a bug the code does not have

- **WHEN** a finding claims a defect that verification against the code
  refutes
- **THEN** the agent SHALL answer with the line that shows the code is
  correct and SHALL change nothing for that finding

#### Scenario: The finding is confirmed

- **WHEN** verification confirms the finding
- **THEN** the agent SHALL fix it and SHALL cite the fix in its answer

#### Scenario: The reviewer asks for work beyond the change

- **WHEN** a finding proposes a feature or a rework outside the change under
  review
- **THEN** the agent SHALL raise it as a question for the user and SHALL NOT
  write the code for it

### Requirement: Release readiness marks every item with evidence under Czech and EU law

The `release-readiness` skill SHALL walk its checklist for the named product, mark each item
`have` with evidence, `missing`, or `n/a` with a reason, use the Czech or EU rule where the
checklist's source assumed a US one, and turn each `missing` item into a task.

#### Scenario: a launch question gets an evidence table under Czech and EU law

- **WHEN** the person asks what is still needed before selling a product
- **THEN** the reply is a table of items marked have, missing or n/a with evidence, names Czech
  or EU specifics, and creates a task per missing item

### Requirement: Dependencies

qsm-review SHALL declare `qsm-forge` in the `dependencies` array of its plugin.json and SHALL
declare nothing else; the solo review, the readability score, `received-findings` and
`release-readiness` call no other plugin.

- `qsm-forge`: `workflow-review` reads and posts a review through `qsm-forge gh` and `qsm-forge gl`.

#### Scenario: Installing the plugin

- **WHEN** the plugin is installed
- **THEN** `claude plugin install` installs `qsm-forge` with it

#### Scenario: qsm-forge is not installed

- **WHEN** `workflow-review` runs and the `qsm-forge` binary is not on PATH
- **THEN** the skill SHALL report `missing`, name `qsm-forge`, and tell the caller to install it,
  and SHALL NOT attempt the review
