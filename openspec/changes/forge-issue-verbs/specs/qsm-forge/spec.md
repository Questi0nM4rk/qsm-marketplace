## ADDED Requirements

### Requirement: Create an issue

The GitHub bin SHALL create an issue with `qsm-forge gh issue create <title>`, taking the body from
`--body` or from `--file`, any number of `--label` values, an optional `--type <name>` that sets the
organization issue type
(`Epic`, `Task`), and an optional `--parent <n>` that makes the new issue a sub-issue of issue n.
It SHALL report the number, URL, title, labels, type and parent in the envelope data (`number`,
`url`, `title`, `labels`, `type`, `parent`, the last two null without a type or a parent).

#### Scenario: Create with labels and a parent

- **WHEN** the caller creates an issue with two labels and `--parent` naming an open issue
- **THEN** the issue exists with both labels and appears among the parent's sub-issues, and the
  data holds its number and URL

#### Scenario: Create an epic and a task under it

- **WHEN** the caller creates an issue with `--type Epic` and then another with `--type Task` and
  `--parent` naming the first
- **THEN** the first has type Epic, the second has type Task and appears among its sub-issues

#### Scenario: Body from a file

- **WHEN** the caller passes `--file` naming a readable file
- **THEN** the issue body is that file's text, unchanged

#### Scenario: Both body sources or none of a title

- **WHEN** the caller passes both `--body` and `--file`, or no title
- **THEN** the verb fails with `usage` (exit 2) and creates nothing

#### Scenario: A body file that cannot be read

- **WHEN** `--file` names a path this process cannot read
- **THEN** the verb fails with `missing` (exit 4) naming the path and creates nothing

#### Scenario: A label that does not exist

- **WHEN** a `--label` names a label the repository does not have
- **THEN** the verb fails with `failed` (exit 1) naming the label, and no issue is created

#### Scenario: Created but not attached

- **WHEN** the issue is created and GitHub then refuses to attach it to `--parent`
- **THEN** the verb fails with `failed` (exit 1), the message names the created issue number and
  says it exists without a parent, and nothing is deleted or retried

### Requirement: Close an issue with a reason

The GitHub bin SHALL close an issue with `qsm-forge gh issue close <n>`, taking `--reason`
(`completed`, the default, or `not-planned`) and an optional `--message` posted as the closing
comment. It SHALL report `number`, `url`, `reason` and `alreadyClosed` in the data.

#### Scenario: Close as not planned with a comment

- **WHEN** the caller closes an open issue with `--reason not-planned --message "superseded"`
- **THEN** the issue is closed with state reason not planned and the comment is on it

#### Scenario: Already closed

- **WHEN** the caller closes an issue that is already closed
- **THEN** the verb reports `alreadyClosed` true, exits `ok`, and leaves the earlier reason and
  comments as they were

#### Scenario: A reason outside the two

- **WHEN** the caller passes any other `--reason`, including `duplicate`
- **THEN** the verb fails with `usage` (exit 2) naming the two accepted values and closes nothing

#### Scenario: No such issue

- **WHEN** the number names no issue in the repository
- **THEN** the verb fails with `failed` (exit 1) naming the number

### Requirement: Comment on an issue

The GitHub bin SHALL post one comment with `qsm-forge gh issue comment <n> --message <text>` and
report the issue `number` and the comment's `url` in the data.

#### Scenario: Comment posted

- **WHEN** the caller comments on an open or closed issue
- **THEN** the comment is the issue's last comment, with the text unchanged

#### Scenario: Empty message

- **WHEN** the message is missing or only whitespace
- **THEN** the verb fails with `usage` (exit 2) and posts nothing

### Requirement: Attach an existing issue as a sub-issue

The GitHub bin SHALL attach issue child to issue parent with
`qsm-forge gh issue sub-issue <parent> <child>`, and report `parent` and `child` in the data. The
caller never gives a numeric issue id; the verb resolves it.

#### Scenario: Child attached

- **WHEN** the caller attaches an open issue to a parent
- **THEN** the child is listed among the parent's sub-issues and names the parent as its parent

#### Scenario: GitHub refuses the nesting

- **WHEN** GitHub refuses, because the child already has another parent, the parent has the
  maximum number of children, or the issues belong to different owners
- **THEN** the verb fails with `failed` (exit 1) carrying GitHub's cause, and changes nothing

#### Scenario: An issue under itself

- **WHEN** parent and child are the same number
- **THEN** the verb fails with `usage` (exit 2) and calls GitHub not at all

### Requirement: Add or remove a blocked-by dependency

The GitHub bin SHALL record or lift a dependency with `qsm-forge gh issue blocked-by <n>`, given
exactly one of `--add <m>` (issue n becomes blocked by issue m) or `--remove <m>`. It SHALL report
`number`, `blockedBy` (the number m) and `action` (`added` or `removed`) in the data.

#### Scenario: Dependency added then removed

- **WHEN** the caller adds m as a blocker of n, then removes it
- **THEN** after the first call GitHub lists m among n's blockers, and after the second it does not

#### Scenario: Neither or both of add and remove

- **WHEN** the caller passes neither `--add` nor `--remove`, or both
- **THEN** the verb fails with `usage` (exit 2) and changes nothing

#### Scenario: GitHub refuses the dependency

- **WHEN** GitHub refuses, because the dependency would be a cycle or an issue does not exist
- **THEN** the verb fails with `failed` (exit 1) carrying GitHub's cause, and changes nothing

#### Scenario: Removing a dependency that is not there

- **WHEN** the caller removes a blocker n does not have
- **THEN** the verb fails with `failed` (exit 1) naming both numbers, rather than report a removal

### Requirement: List the issues that are ready to work

The GitHub bin SHALL list open issues that no open issue blocks and that are not of type Epic, with
`qsm-forge gh issue ready`, optionally narrowed by `--parent <n>` (the sub-issues of n) and by
`--label <name>`, in ascending number order. Each row SHALL carry `number`, `title`, `url`,
`labels` and `parent`. It SHALL read at most 200 issues, and when it hit that cap it SHALL say the
list is cut, as a warning, still exiting `ok`.

#### Scenario: A blocked issue is left out

- **WHEN** issue 2 is blocked by an open issue 1 and the caller lists ready issues
- **THEN** issue 1 is listed and issue 2 is not

#### Scenario: A closed blocker no longer blocks

- **WHEN** issue 2 was blocked by issue 1 and issue 1 is closed
- **THEN** issue 2 is listed

#### Scenario: Narrowed to one epic

- **WHEN** the caller passes `--parent` naming an epic
- **THEN** only open, unblocked sub-issues of that epic are listed

#### Scenario: An epic is never ready

- **WHEN** an open epic has no blocker
- **THEN** it is not listed, and its open sub-issues are

#### Scenario: Nothing ready

- **WHEN** no open issue matches
- **THEN** the verb exits `ok` with an empty list and says none are ready

### Requirement: A refused call fails loud and does nothing else

Every issue verb SHALL, when GitHub or `gh` refuses a call, exit `failed` (1) with the cause GitHub
gave in the message, and SHALL NOT try a second route, retry, roll back, or continue to a later
step. A wrong call (an unknown flag, a missing required argument, a value outside its choices)
SHALL exit `usage` (2) before any call to GitHub. A repository that cannot be resolved, or `gh`
missing from PATH, SHALL exit `missing` (4). No issue verb SHALL introduce an outcome code beyond
the existing ones.

#### Scenario: Missing scope or no login

- **WHEN** `gh` has no login or a token without the needed scope
- **THEN** the verb exits `failed` (1) with the message `gh` printed, and nothing is changed

#### Scenario: A usage error calls nothing

- **WHEN** any verb is called with a wrong argument
- **THEN** the recorded calls to `gh` are empty

#### Scenario: The repository option

- **WHEN** the caller passes `--repo owner/name` or runs inside a checkout with an origin remote
- **THEN** every issue verb acts on that repository, resolved as the review verbs resolve it
