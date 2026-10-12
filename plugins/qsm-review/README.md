# qsm-review

Strict review from outside the assumptions that wrote the change, for a developer who wants a
second reader on every change.

## Why it exists

A change reviewed by the agent that wrote it is reviewed by the assumptions that wrote it.
qsm-review exists to bring one strict standard to every change from outside, and to give the
review that comes back a second pass before anyone acts on it. It takes the stance that a finding
is either verified against the code or not reported. It refuses to be a style nag, a rubber stamp,
or a second opinion that hedges. When changes stop needing a second reader, this plugin can go.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `review` | Solo strict review of a diff, a branch or paths, or a readability score. Posts nothing |
| Skill | `workflow-review` | Reviews one pull or merge request end to end and posts it under your own forge account |
| Skill | `received-findings` | Checks each finding against the code before anything changes because of it |
| Skill | `release-readiness` | The readiness checklist before a release or a sale, under Czech and EU law, each item marked with evidence |
| Agent | `strict-reviewer` | Reviews one change alone and returns findings and a verdict |
| Agent | `readability-reviewer` | Reads a codebase or a skill as a first-time reader and scores it out of ten |

The reviewer reports every finding it can support, each a required change. Zero findings approves.
Any finding requests changes.

## Install

```bash
claude plugin install qsm-review@qsm-marketplace
```

Brings `qsm-forge` with it: `workflow-review` reads and posts a review through `qsm-forge gh` and
`qsm-forge gl`.

## Use

Skills fire on the kind of ask.

- ask: "review my diff" loads `review`.
- ask: "review PR 12" loads `workflow-review`. Ask for a dry run to get the result in the session.
- ask: "address the review comments" loads `received-findings`.
- ask: "is this ready to release?" loads `release-readiness`.

## Caveats

- `workflow-review` posts as you and can take tens of minutes with up to eight agents. A dry run
  reports in the session and posts nothing.
- The script fails closed: a dead correctness anchor aborts instead of approving.
- The readability score is a measurement only. Run it on finished work.
