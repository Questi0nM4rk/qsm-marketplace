---
name: workflow-review
description: "Use to review one whole GitHub pull request or GitLab merge request end to end and post the result under the caller's own forge account. Triggers: review PR 12, review this MR, review the pull request, post a review, strict review of the PR, dry-run review. Runs the bundled review workflow and posts through qsm-forge gh or qsm-forge gl. For a change that stays in the session, use review."
---

# Workflow review

A pull request is public, so the review posts under the caller's own forge account, never a bot or
an env token. The judgement is in `${CLAUDE_PLUGIN_ROOT}/workflows/strict-review.mjs`. You gather
facts and post, because the workflow has no filesystem or network. You do not review in the session
and you do not change the code. It is the review step of the qsm flow for a change that lives on a
forge; the findings then go to received-findings. Reading the author's replies later, answering
and resolving threads is the review-threads skill, not this one.

## Before the run

- If the `qsm-forge` binary is not on PATH, report `missing`, name `qsm-forge`, tell the caller to
  install it (`claude plugin install qsm-forge@qsm-marketplace`), and stop without attempting the
  review, because the review has nowhere to read from or post to.
- Resolve target and forge: the caller's number, or the open request on this branch; else ask.
  GitHub is `qsm-forge gh`, GitLab is `qsm-forge gl`.
- Check auth first with the forge bin's status verb. On failure name the forge and the sign-in
  command and stop, because the run is long.
- Dry run if the caller says so: same work, reported in the session, nothing posted.
- An automated rerun skips when threads still wait on the author or the head is unchanged since
  the last posted review. A rerun the caller asks for always proceeds.

## Run

- Check out a worktree at the head. Write the full base-to-head diff to a file and pass its path,
  never the diff, because a truncated diff is reviewed as whole.
- Call the Workflow tool on the script with a JSON object, never a JSON string:

```json
{
  "ctx": { "platform": "github", "repo": "owner/name", "number": 12, "title": "...",
           "body": "...", "headSha": "...", "baseRef": "main", "files": ["src/a.ts"],
           "changedLines": { "src/a.ts": [12, 13, 40] } },
  "diffPath": "<absolute path of the diff file>",
  "worktree": "<absolute path of the review worktree>",
  "userMessage": "<the caller's question, only when asked>"
}
```

- `ctx` holds forge facts only. `changedLines` lets the workflow move findings on undiffed lines
  into the body, because the forge refuses the whole submit over one bad anchor.
- Do not rebuild the phases inline.
- Read the result first. `mode: "answer"`: relay it, post nothing. `mode: "aborted"`: relay
  `reason`, post nothing, review nothing yourself. Name any `skippedLenses` in the reply.

## Post, or report

- Check the head has not moved. If it has, start again from a fresh worktree.
- Post once with the forge bin's review-submit verb, payload
  `{"decision": "approve" | "request-changes" | "comment", "body": "...",
  "inline": [{"path": "src/a.ts", "line": 7, "body": "..."}]}`.
  Other keys post an empty review with no error.
- The payload is what the workflow returned: add, reword and drop nothing. The `refuted` list
  holds dropped findings; never revive one.
- If the forge refuses a comment position, fold that finding into the body and resend.
- A dry run prints verdict, finding count, lenses and the payload, and says nothing was posted.
- At the end, even after a failure, remove the worktree and the diff file. Never say posted when
  the post failed.

## Red flags

- Context built, auth unchecked: check it now.
- Rerun with threads waiting on the author: skip.
- Editing a finding before posting: post it as returned.
- Aborted run and you are about to approve: post nothing.

## Say it in the reply

Before: target, forge, posts or dry run. After: verdict, finding count, rating, lenses, dead lens
slots, folded findings, where it posted or that nothing did and why. A stopped run names the gate;
an aborted run gives the reason and says no review exists.
