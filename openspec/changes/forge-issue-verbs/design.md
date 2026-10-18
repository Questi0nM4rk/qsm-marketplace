## Context

qsm-forge has `qsm-forge gh <verb>` for review threads: handlers in `scripts/cli-gh.ts`, logic and
forge calls in `lib/github.ts`, every external call through the `Run` type of `lib/exec.ts` so a
test hands it a recorded answer, the repository from `lib/remote.ts`. The new verbs follow that
shape and add nothing beside it. The epic's API research (`gh` 2.102 on this machine) shows that
`gh issue create --label --parent --blocked-by`, `gh issue edit --add-sub-issue
--add-blocked-by --remove-blocked-by`, `gh issue close --reason --comment` and
`gh issue list --json blockedBy,parent,labels` cover every verb, and that `gh` resolves the numeric
issue id itself, which is the step the raw REST route makes the caller do.

## Goals / Non-Goals

**Goals:** one verb per issue step, same envelope and exit codes as the review verbs, the board
verbs of piece 2 able to sit beside them without a rewrite.

**Non-goals:** board verbs, GitLab, `view`/`edit`, label management, a guard hook, the skills.

## Decisions

1. **Shell out to `gh issue ...`, not to `gh api`.** The CLI already makes the id lookup, the
   argument checks and the authentication, and its flags are the documented surface. The cost is
   a minimum `gh` behaviour (the flags above); a `gh` without one fails with its own message,
   loud. `gh api` stays for what `gh issue` cannot do, which is nothing in this change.
2. **Verb names are three words, `gh issue <verb>`**, which `qsm.json` allows (the noun joins them,
   `$.forge.ghIssueCreate`). The review verbs stay as they are. `sub-issue` and `blocked-by` keep
   GitHub's own words.
3. **`create --parent` is one `gh` call.** `gh issue create --parent n` is one command from the
   caller's side, so the verb does not create-then-attach itself. If `gh` creates and then fails
   to attach (unverified what it does; task 1 measures it), the verb reads the number out of what
   `gh` printed and names it in the failure. No rollback: closing or deleting the stray issue is a
   second path that can fail too, and a named orphan is found in one search.
4. **Body text goes in as a file, never as argv.** `--body` is passed as `--body-file -` on
   `gh`'s stdin, as is `--file`'s text, because a task body holds backticks and quotes and argv is
   one shell parse away from mangling it (git rule 7).
5. **`close` reads the state first** (`gh issue view --json state,stateReason`), so a closed issue
   reports `alreadyClosed` and keeps its first reason. Two calls, because `gh issue close` on a
   closed issue prints a message and exits 0, and the verb must tell the caller which happened.
   Reasons are `completed` and `not-planned`; `gh`'s `duplicate` needs `--duplicate-of`, a second
   argument nothing in the task flow uses.
6. **`ready` is one read and a filter.** `gh issue list --state open --json
   number,title,url,labels,parent,blockedBy --limit 200` (plus `--label`), then the verb keeps
   issues with no open blocker and, with `--parent n`, those whose parent is n. Whether
   `blockedBy` entries carry a state is unverified; task 1 reads one. If they carry none, the
   verb treats every listed blocker as open only when it is in the same open list, which is
   correct because the list holds all open issues up to the cap, and a blocker outside the cap
   triggers the cut-list warning. The 200 cap is a single-maintainer size; hitting it warns, it
   does not page.
7. **Outcome codes are the existing ones.** `usage` before any call, `missing` for repository,
   `gh` or a file, `failed` for a GitHub refusal with `gh`'s stderr as the message. The thread
   verbs map errors the same way (`lib/exec.ts` rejects with the command's own words), so no code
   is added.
8. **Board verbs take the project owner and number as arguments** (piece 2). Nothing here assumes
   a personal account: no verb reads `@me`, and the repository comes from `--repo` or origin. The
   board moves to an organisation tomorrow and these verbs must not care.

## Data

No stored data. The envelope `data` per verb is in the spec; `ready` returns
`{ issues: [{ number, title, url, labels, parent }] }`, `labels` as names, `parent` a number or
null.

## Failure behaviour

Every failure is an outcome with a cause in the message; the only half-state is decision 3, named
in its message. A wrong call exits before `gh` runs, so no test of usage needs the network.

## Proof

A live run on this repository, commands in tasks.md, with issues titled `test: ...` created,
nested, ordered, commented on, listed as ready and closed, then a search that finds none open. A
single `bun test` through `runBin` with a recording fake `gh` proves that a usage error runs
nothing and that a refusal stops the verb at the failing call.

## Open decisions

1. **Should the forge-guard refuse raw `gh issue create|close|comment|edit` and the sub-issue and
   dependency REST paths**, as it refuses raw review calls? Recommended yes, in the next piece,
   once the verbs have run live: a guard before the verbs are proven would block the only way to
   file an issue. Not done here, so the guard and its spec scenario ("non-review call attempted")
   are unchanged.
2. **The `epic` label does not exist in the repository.** Recommended: create it once with
   `gh label create epic`, as a step of task 6's proof, because a `labels` verb is used once.
