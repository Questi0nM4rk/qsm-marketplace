# qsm-forge Specification

## Purpose

qsm-forge gives an agent atomic verbs for a pull or merge request's review threads, so it never
composes raw platform API calls by hand. Each verb is faster and more consistent than the model's
standard way of doing the same job with raw platform calls.

## Requirements

### Requirement: Pull or merge request status summary

The CLI SHALL report a pull or merge request's state, merge readiness, and
unresolved review-thread count, given its number or identifier.

#### Scenario: Status requested

- **WHEN** the caller runs the status verb with a PR number or MR
  identifier
- **THEN** the CLI SHALL print state, merge readiness, and the
  unresolved-thread count, plus each check's name and result for GitHub or
  the pipeline result for GitLab, plus review decision for GitHub

#### Scenario: Identifier not found

- **WHEN** the identifier names no pull or merge request in the project
- **THEN** the CLI SHALL fail with a non-zero exit naming the identifier,
  not report an empty status

#### Scenario: Platform unreachable

- **WHEN** the platform client cannot reach the forge or has no valid
  authentication
- **THEN** the CLI SHALL fail with that client's error, not report status

### Requirement: Unresolved thread listing

The CLI SHALL list a pull or merge request's unresolved review threads,
each with its identity, file path, line number, first comment body, and
whether it already carries a reply.

#### Scenario: All threads resolved

- **WHEN** the caller lists threads and none are unresolved
- **THEN** the CLI SHALL report that none are unresolved, rather than fail

### Requirement: Review comment listing

The GitHub bin SHALL list a pull request's review comments, and SHALL
restrict the list to unresolved comments when asked.

#### Scenario: Filtered to unresolved

- **WHEN** the caller lists comments with the unresolved filter
- **THEN** the CLI SHALL return only comments belonging to an unresolved
  thread

#### Scenario: Provenance in JSON

- **WHEN** the caller lists comments as JSON
- **THEN** each comment SHALL carry its URL, creation and update times, author
  association and type, review id, current and original commit, and current
  and original line range, with an explicit null for a value GitHub does not
  have, and the text columns SHALL NOT change

### Requirement: Reply to a review thread

The CLI SHALL post a reply to one review thread identified by its comment
or thread identity.

#### Scenario: Reply without a message

- **WHEN** the caller requests a reply with no message text
- **THEN** the CLI SHALL fail with a non-zero exit and state that a
  message is required, and SHALL NOT post anything

#### Scenario: Identity does not exist

- **WHEN** the caller replies to an identity that belongs to no thread on
  the pull or merge request
- **THEN** the CLI SHALL fail with a non-zero exit and SHALL NOT post a
  reply

#### Scenario: Effect on thread resolution

- **WHEN** the reply is posted
- **THEN** the GitHub bin SHALL resolve that thread afterward unless the
  caller opts out, and the GitLab bin SHALL leave the thread unresolved

### Requirement: Resolve a review thread

The CLI SHALL resolve one review thread by its identity, optionally
posting a reply first.

#### Scenario: Identity not found

- **WHEN** the caller resolves an identity absent from every thread on the
  pull or merge request
- **THEN** the CLI SHALL fail with a non-zero exit and resolve nothing

#### Scenario: Already resolved

- **WHEN** the GitHub bin resolves a thread that is already resolved
- **THEN** it SHALL report the thread as already resolved and SHALL NOT
  fail

#### Scenario: Resolve without a reply

- **WHEN** the caller resolves a thread with no message
- **THEN** the CLI SHALL mark the thread resolved and post no note

### Requirement: Resolve all eligible threads

The GitHub bin SHALL resolve every unresolved thread on a pull request.
Given a reply message, it SHALL reply to and resolve all of them; given
none, it SHALL resolve only the threads whose latest reply already
carries a fixed-in marker, and SHALL leave every other thread open.

#### Scenario: No thread carries the marker

- **WHEN** the caller resolves all threads with no message and none of
  their latest replies carry the marker
- **THEN** the CLI SHALL resolve nothing and report that none were
  eligible

### Requirement: Dismiss stale reviews

The GitHub bin SHALL dismiss every pull request review currently in the
changes-requested state, optionally restricted to one author and with a
caller-supplied dismissal message.

#### Scenario: No matching review

- **WHEN** the caller dismisses reviews filtered to an author with no
  changes-requested review on the pull request
- **THEN** the CLI SHALL report that nothing was dismissed and SHALL NOT
  fail

### Requirement: Submit a whole review atomically

The CLI SHALL accept one review payload and post it as a single review:
an overall comment, zero or more inline comments each tied to a file and
line, and a decision among comment, approve, or request-changes.

#### Scenario: Empty or malformed input

- **WHEN** the caller submits a review with no file, nothing piped to
  standard input, or input that cannot be parsed as the review payload
- **THEN** the CLI SHALL fail with a non-zero exit and post nothing

#### Scenario: A payload file that cannot be read

- **WHEN** the caller names a payload file this process cannot read
- **THEN** the CLI SHALL report `missing`, name the path, say that nothing
  was posted, and post nothing

#### Scenario: Approve decision

- **WHEN** the payload's decision is approve
- **THEN** the CLI SHALL post the overall comment, post each inline
  comment at its file and line, and approve the pull or merge request

#### Scenario: Request-changes decision

- **WHEN** the payload's decision is request-changes
- **THEN** the CLI SHALL post the overall comment and inline comments, and
  the GitLab bin SHALL withdraw any existing approval

#### Scenario: Successful submission

- **WHEN** a well-formed review is submitted through the GitHub bin
- **THEN** it SHALL report the created review's identity and URL

### Requirement: One verb replaces a multi-call sequence, with one shape on both forges

Each verb SHALL do in one invocation what the raw platform way needs several
calls for (listing threads, finding identities, replying, resolving, posting
a review), and SHALL give the same result shape and the same failure
behaviour for the same operation on GitHub and on GitLab, so a caller does
not relearn the output per forge.

#### Scenario: Answering a round of fixes

- **WHEN** the caller resolves every thread whose latest reply carries the
  fixed-in marker
- **THEN** one invocation SHALL do it and report how many threads were
  resolved, with no preceding listing call needed

#### Scenario: The same operation on both forges

- **WHEN** the caller lists unresolved threads on a pull request and on a
  merge request
- **THEN** each row SHALL carry the same fields, identity, file, line, first
  comment and reply flag

### Requirement: Repository resolution

The GitHub bin SHALL operate against the repository named by an explicit
repository option when given, and SHALL otherwise detect it from the
current git checkout.

#### Scenario: No repository detectable

- **WHEN** a verb runs with no repository option outside any git checkout
- **THEN** the CLI SHALL fail with a non-zero exit naming the missing
  repository, rather than guessing one

### Requirement: Doctor reports whether a forge CLI is there

`qsm-forge doctor` and `install` SHALL check `gh` and `glab` against PATH as one
row, "gh or glab". Either alone satisfies it; the verdict SHALL be `missing`
only when neither is present.

#### Scenario: Only one forge CLI installed

- **WHEN** `gh` is on PATH and `glab` is not
- **THEN** the verdict SHALL be `ok`

#### Scenario: No forge CLI installed

- **WHEN** neither `gh` nor `glab` is on PATH
- **THEN** the verdict SHALL be `missing`, exit 4, in one line naming both

### Requirement: Review-thread operations are forced through the wrapper

A PreToolUse hook SHALL block a raw platform-CLI or API call that reads or
mutates pull or merge request review state.

#### Scenario: Raw GitHub review call attempted

- **WHEN** an agent issues a raw GitHub call reading or mutating PR review
  threads, review comments, or review dismissals
- **THEN** the hook SHALL block the call and name the wrapper verb that
  covers it

#### Scenario: Raw GitLab review call attempted

- **WHEN** an agent issues a raw GitLab call reading or changing an MR's
  discussions, notes, or approval state
- **THEN** the hook SHALL block the call and name the wrapper verb that
  covers it

#### Scenario: Non-review call attempted

- **WHEN** an agent issues a platform-CLI or API call unrelated to review
  state, such as clone, creation, listing, or releases
- **THEN** the hook SHALL allow it

### Requirement: Review-thread skill

A skill SHALL trigger when an agent is asked to read, reply to, resolve,
dismiss, or submit review threads on a pull or merge request, and SHALL
direct it to qsm-forge gh for GitHub or qsm-forge gl for GitLab rather
than a raw platform-CLI or API call.

#### Scenario: Agent asked what is unresolved

- **WHEN** the agent is asked what is unresolved on a pull or merge
  request
- **THEN** the skill SHALL trigger and produce the wrapper-verb
  invocations for the matching forge, not a raw call
