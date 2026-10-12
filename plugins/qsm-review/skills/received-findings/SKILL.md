---
name: received-findings
description: "Use whenever review findings arrive and something is about to change because of them: a human's comments, a posted review, a reviewing subagent's report, a linter's complaint someone forwarded. Triggers: address the review comments, fix the findings, the reviewer says, PR feedback, respond to the review, oprav pripominky. Verify each finding against the code before touching it."
---

# Answering findings you receive

A finding is a claim about the code from someone who read part of it. Reviewers here are asked to
report everything they can support, so a batch holds true findings next to wrong ones, and this
skill is the second pass that tells them apart. It serves the person who wants the real defects
fixed and the correct code left alone. It does not decide scope: work beyond the change is the
person's call. It follows review or workflow-review in the qsm flow; once the real
defects are fixed, the change goes on to spec-archive.

## Per finding

- Open the code the finding names, and what calls it, before forming an opinion. Agreeing from
  memory is not checking.
- Count a finding as confirmed when you can state the failure: the input, state or sequence that
  reaches the bad outcome. Whoever wrote it, without that it is not confirmed.
- Fix a confirmed finding and cite the file, the line and what is now true that was not. "Done"
  cannot be checked by the reviewer.
- Answer a refuted finding with the evidence, the line that handles the case or the check that
  covers it, and change nothing. A defensive edit made to end an argument is an unreviewed change
  on top of correct code.
- Agree only with what the code supports, whatever the seniority of the reviewer or the tone of
  the tool. A wrong public reply costs less than a silent regression.
- When you cannot settle it, say what you could not determine and what would settle it, and leave
  the code as it is. Half-implementing a finding you do not understand leaves code nobody can
  explain.

## Across a batch

- Verify the whole batch before changing anything. Findings contradict each other and two often
  share one cause, so fixing in arrival order produces edits that undo each other.
- Answer every finding, refuted and deferred ones included, because an unanswered finding is one
  the reviewer has to chase.
- A finding that asks for work beyond the change (a new subsystem, a rewrite, a feature) goes to
  the person as one question with your recommendation and what it would cost, and you wait. Tell
  the reviewer "out of scope for this change, raised with the author", because silence reads as
  agreement.

## Red flags

- When you are editing a file whose named line you have not read, stop and read it, because the
  edit rests on someone else's reading.
- When a fix makes a test pass by changing the test, revert the test change and re-check the
  finding, because the test was the evidence.
- When every finding in a batch was confirmed, re-check the batch, because reviewers that report
  everything are wrong sometimes.
- When a finding asked for a feature and you started building it, stop and ask the person,
  because a two-file change becomes a twelve-file one nobody approved.

## Say it in the reply

One line per finding: confirmed and fixed with file and line, refuted with the evidence, or raised
with the person as out of scope. Then the counts. If a finding changed what you believe about the
design and not just one line, say that separately.
