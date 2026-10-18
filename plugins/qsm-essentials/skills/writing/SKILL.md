---
name: writing
description: "Use when writing anything the reader ships or keeps: a commit message, a merge request title and description, a code review reply, a README or design document, a code comment, an error message, a changelog entry. Triggers: write the commit message, describe this MR, document this, reply to the review, README for this, explain this in the docs, napis commit."
---

# Writing

Chat follows the output style. This skill is for text that outlives the conversation: someone reads
it later, without you there, and acts on it. It serves that reader. The failure it prevents is text
that describes what was done instead of what the reader needs: a commit listing files, a README
explaining the framework, each correct and useless. Before the first word, know who reads it, what
they do after, and the one thing they must not miss. It does not make the text longer: say what the
reader needs and stop.

## For everything

- Lead with what the reader does with it: a commit says what changed and why, a README how to use
  it in two minutes. Reason and detail follow.
- One reading per sentence: each pronoun points at one thing, `only` and `not` sit beside the
  word they limit, no more than two nouns in a row ("the timeout of the retry policy", not "retry
  policy timeout").
- Explain a term in the sentence that first uses it, or use the plain word, because the reader in
  a year does not remember the team's code name.
- A file that describes the present has no "previously", "used to", "now", "new", because git is
  the history.
- Full sentences and grammar in files, because the reader cannot ask what a fragment meant.
- A number carries its unit and how it was measured: "P95 (the time under which 95 percent of
  requests finish) from 400 ms to 120 ms on the staging load test", never "faster".
- No filler or intensifiers ("simply", "just", "basically", "obviously"), no apologies, because each
  asks the reader to trust instead of read.
- No dashes as punctuation, no semicolons outside code, no emoji, because the person reads them as
  AI tells and a junior reader trips on them.

## Commit message

- Subject: `type(scope): what changed`, under 72 characters, in Conventional Commits types
  (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `build`), naming the behaviour for the
  reader of the history, not the file: `fix(auth): refresh token before it expires, not after`.
- A body only when the subject cannot carry the why: one paragraph on the reason, one on the
  consequence a future reader must know. The what is in the diff, the why is nowhere else.
- One change per commit, so "and" in the subject means two commits, and a refactor never shares
  one with a behaviour change.
- A commit that bypasses a check says so in the body, with the number that failed and why the
  bypass is right, because silence is a lie of omission the next reader inherits.

## Ticket

An epic, task or issue is written by the task-writing skill of qsm-tasks.

## Merge request

- Title is the commit subject of the whole branch.
- Description in four short parts under twenty lines: what changed as behaviour, why with the
  ticket linked, how to verify as commands or clicks to repeat, and the one file or decision where
  the reviewer's attention buys most. Add risk and what a revert does when a migration, config
  change or flag is involved.
- Do not narrate the diff. Say what it does not show: the reason, the rejected alternative, what
  you are unsure about.

## Review reply

- First sentence answers the point: agreed and changed, agreed and not changed because X, or
  disagreed because Y with the evidence. Then stop.
- When you changed code, say what and where for a one-click re-check. When you did not, leave the
  reviewer a way to disagree. No thanks, no apologies, no "great catch".

## Documentation

- README in order: what it is in one sentence, how to install, the common case as a copyable
  command, where the details are. A section that does not help a new user in ten minutes is not
  README material.
- Document our surface only (commands, flags, conventions, gotchas) and link upstream, because a
  transcription of someone else's docs is stale the day they change.
- Give every abstraction one concrete instance the reader can run or check: a command with its
  output, a payload.
- A design document is an architecture decision record in the software-architecture shape, with no
  tutorial, history or promise.
- One owner per fact. Link to it, because a fact in two documents disagrees within a month.

## Code comment

What a comment holds (the why, the interface's promise) is in the software-design skill. Hygiene
here: no commented-out code, no author names or dates, no TODO without a task in the task tool,
because git has the history and the tracker has the tasks.

## Error message

- Written for the person who sees it, when they see it: what happened in their words, then what
  to do. "Config file not found at ./qsm.json. Run `myapp init` to create one." Not "ENOENT".
- A stable code the program branches on, a message the human acts on, and the data needed to act,
  in one shape for every error of the product. Never blame, joke or shout.

## Red flags

- When a commit subject names a file, name the behaviour, because the history reader never saw the
  diff.
- When an MR description walks through the diff, replace it with the why and the verify.
- When a README explains the framework, link it and get to our commands.
- When a document says "previously" or "new", delete it, because the document ages in a week.

## Say it in the reply

One line above the text: who it is written for and what they will do with it. If you cannot write
that line, you do not know what you wrote.
