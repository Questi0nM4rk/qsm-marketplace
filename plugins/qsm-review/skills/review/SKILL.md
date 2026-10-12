---
name: review
description: "Use for a one-agent strict review of a change that stays in the session: the working diff, a branch, a path set, or a pull or merge request you do not want posted on. Also for a readability score of a codebase or a skill. Triggers: review this, review the diff, quick review, strict review, look over my change, is this ready, is this readable, score this for clarity, how would this read to a new dev, zkontroluj to. Posts nothing. For a whole pull or merge request reviewed end to end and posted, use workflow-review."
---

# Solo review

You wrote the change, so you read it with the assumptions that wrote it. Hand it to the
`strict-reviewer` agent, a reader who has not seen it. It posts nothing and fixes nothing. In the
qsm flow this is the step after spec-apply. Findings go to received-findings, and once those are
fixed the change is reviewed again, because a fix is new code nobody has read; an approve goes on
to spec-archive. A whole PR or MR to be posted is workflow-review.

## Do

- Pin the base: the merge base of the default branch, unless the caller names a branch, paths or a
  request. Say which base, because a wrong base reviews the wrong change.
- Stop on an empty diff and say why it looks empty (uncommitted, wrong base, already merged),
  because a reviewer sent at nothing reports approve.
- Dispatch `strict-reviewer` once with the base, the languages and the linked issue. Never review
  in your own context.
- Relay its report whole: header, standards findings, spec findings, verdict. Keep the two axes
  apart.
- Verdict: zero findings is approve, any finding is request changes. No approve with comments.
- Never drop or soften a finding. Filtering is `received-findings` or the person.
- When the reviewer says the change is too big for one reader, name `workflow-review`.

## Readability score

Dispatch `readability-reviewer` with one path and one label, no opinion of yours, even when you
think you know the score. Relay its six dimensions and the score out of ten. One run per top-level
directory on a large tree, each score reported, never an average.

## Red flags

- About to say approve with no reviewer run: dispatch one.
- About to write "minor" or "nit": relay the finding as it came.
- About to post anywhere: stop. Posting is `workflow-review`.

## Say it in the reply

Base and languages, the report as written, one line with verdict and finding count, then the next
step: received-findings with findings, spec-archive on approve. For a score:
score, one-line summary, path, worst dimension. A too-large change: say that instead of a verdict.
