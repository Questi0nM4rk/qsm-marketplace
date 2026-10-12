---
name: review-threads
description: "Use when reading, answering, resolving, dismissing, or submitting review threads on a pull or merge request. Triggers: what is unresolved on this PR, reply to that review comment, resolve the thread, resolve all threads, dismiss that review, submit my review, check PR status, what is blocking the merge, odpovez na komentare v PR, co je nevyresene. Drives qsm-forge gh for GitHub and qsm-forge gl for GitLab instead of raw platform calls. The review itself is the review skills; this carries a finished decision to the forge."
---

# Review threads

A review thread is a conversation someone is waiting on, and every call here posts under the
user's own account. So read freely and write only what the user asked for: a wrong reply costs
the user standing with their reviewer, a drafted one costs a turn. This skill carries a decision
already made to the forge; it is not the review methodology.

Each verb is one call where the raw way is several: listing threads on GitHub is a GraphQL query
with paging, then a lookup of the thread id behind a comment id, then the mutation. The verbs do
that inside, and a thread row has the same fields on both forges (id, file, line, first comment,
reply flag), so the plan for a round of review is fewer calls and one shape. When you plan the
calls, count them: a plan that lists, looks up and mutates by hand has missed the verb.

`qsm-forge gh` serves GitHub pull requests, `qsm-forge gl` GitLab merge requests; the checkout's
origin remote picks one. Both resolve the repository from the working tree; pass
`--repo owner/name` or `--project namespace/project` only for a target elsewhere.

## Read

- `status` first: state, review decision, merge readiness, unresolved count, checks. Red checks
  mean the threads can wait.
- `threads <number>`: every unresolved thread with comment id, file, line, text, and whether
  someone replied. The comment id is the handle for every write, so read this before replying.
- `qsm-forge gh comments <pr> --unresolved` for the whole conversation. GitLab has no such verb;
  its threads carry every note.
- `--json` when a decision consumes the answer, columns when a person reads it.

## Write

- `reply <number> <comment-id> --message "<text>"`. On GitHub it also resolves the thread, because
  an answered thread left open sends the reviewer back for nothing; `--no-resolve` when the reply
  is a question. On GitLab the thread stays open, since resolving is the reviewer's act there.
- Name where the fix landed: "Fixed in abc1234". The reviewer checks the claim with it and
  `resolve-all` sweeps on it; "done" proves nothing.
- `resolve <number> <comment-id>` without a reply only when nothing needs saying, because a silent
  resolve on a question reads as avoidance.
- `qsm-forge gh resolve-all <pr>` closes only threads whose latest reply starts with "Fixed in":
  the safe sweep after a round of fixes. With `--message "<text>"` it posts that text on every
  open thread and closes them all; use it only when the user asked for exactly that.
- `qsm-forge gh dismiss-reviews <pr>` clears reviews still asking for changes, `--author <login>`
  for one. It is for a stale bot review after the changes landed; ask before dismissing a person.

## Submit a whole review

`submit-review <number> --file <path>`, or the same payload on standard input. One payload, one
call, because on GitLab a review is several requests and a malformed payload posts nothing, which
beats a half-posted review.

```json
{
  "decision": "request-changes",
  "body": "Two things before this merges.",
  "inline": [{ "path": "src/a.ts", "line": 42, "body": "This leaks the handle on the error path." }]
}
```

`decision` is `comment`, `approve` or `request-changes`; `body` is required unless approving.
`request-changes` withdraws an approval on a merge request. Approve only when the user said so.

## Raw calls and exit codes

A hook refuses raw `gh api`, `glab api` and `curl` calls that touch review state and names the
verb that covers it; read the refusal, it is the answer. Cloning, creating, listing and releases
stay open. When no verb fits, say so and ask instead of routing around the hook.

`0` did what it said. `2` written wrong, nothing posted. `1` the forge or its CLI refused, and
the message is theirs: an authentication failure does not fix itself on retry.

## Red flags

- When you are about to reply with a comment id you did not read from `threads`, read it, because
  a guessed id answers the wrong thread.
- When you reach for `resolve-all --message` to save answering each thread, answer them, because
  the reviewer reads the same text everywhere.
- When a reply says "fixed" with no commit, add the hash, because nobody can verify the claim.
- When the user asked for comments and the payload says `approve`, change it, because approval is
  the user's call.

## Say it in the reply

Name the forge and the identifier, what you posted, and what is still open: "Replied on
owner/name#12 src/a.ts:42 and resolved it; two threads still open." When something was not
posted, say so first and why.
