## Context

`plugins/qsm-forge` has `qsm-forge gh <verb>` and `gl <verb>` for review threads, `lib/github.ts`
(arg builders, mappers, a forge that runs one call and maps the other), `lib/exec.ts` (the `Run`
function type, so a test hands in a recorded answer), `lib/remote.ts` (repository from `origin`
or `--repo`), a `qsm.json` that declares every verb, and a hook that blocks raw review calls.
Piece 1, `forge-issue-verbs`, adds issue verbs beside them; this change adds board verbs.

The board is org Project #1 "qsm-marketplace" of `qsmark-labs`, linked to the repository. It has
two single-select fields (measured, with the option names the spec lists): Status for tasks and
pull requests, Epic stage for epics. An epic is an issue of the issue type `Epic`, a task an issue
of type `Task` and a sub-issue of its epic. Eight built-in workflows are on: Auto-add to project,
Auto-add sub-issues to project, Item added to project (Status Todo), Item closed (Status Done),
Auto-close issue, Pull request linked to issue, Pull request merged, Auto-archive items.

Measured with `gh` 2.102.1: issue JSON has `parent`, `subIssues`, `blockedBy`, `blocking`,
`issueType` and `subIssuesSummary` {total, completed, percentCompleted}; project fields are written
by `gh project item-edit --field-id --single-select-option-id`; `repository.issue.projectItems`
answers an issue's board, field values and assignees in one call.

## Goals / Non-Goals

Goals: an agent moves, reads and claims through three verbs with no node id and no raw
`gh project`; an epic reaches Ready For Test without an agent remembering it; the board is named
by arguments.

Non-Goals: creating the board, fields, views or built-in workflows (the owner, once, in the web
UI: the API cannot set a view's column field or a workflow), the App bot, the QA agent, a
cross-repository board, GitLab, listing a whole board, a guard hook for board calls.

## Decisions

1. **Three verbs under `gh`, hyphenated like `resolve-all`.** `board-set`, `board-status`,
   `claim`. The issue is a positional number and `--repo` is as in every other verb; the board is
   `--owner <login> --project <number>`, both required, never defaulted.
2. **Two fields, one verb.** `board-set` takes exactly one of `--status` and `--stage`. Each value
   is one of the exact option names, checked before any call: five for Status, six for Epic stage.
   Anything else is a usage error (exit 2) listing the names. The board's own option names are the
   contract; a board that renamed one fails loud with GitHub's answer. The names live in the spec
   with the definition the board shows, so a reader of the spec knows what each column promises.
3. **The field must match the issue type.** The verb reads the issue's `issueType` first. `--stage`
   on anything but an Epic and `--status` on an Epic are refused (exit 1, naming the issue, its
   type and the field). Reason: the views filter on it (`-type:Epic -has:epic-stage` for the Tasks
   board, `type:Epic` for the Epics board), so a task with an Epic stage vanishes from its board.
   An epic's own Status stays what the "Item added to project" workflow gave it, Todo, and nothing
   reads it.
4. **One GraphQL read, one write.** The read asks the issue for its type, state, assignees, parent
   and `projectItems`, picks the item whose project owner and number match, and reads the board's
   project id, field ids and option ids; the write is `gh project item-edit`. `item-list` pages by
   30 and would need a scan. A name that is not an option of the board is GitHub's refusal, loud.
5. **Claim is a task's board item, Status, assignee, then its epic.** It refuses an Epic (a task is
   what is claimed), a closed issue, and one assigned to another login, all `blocked` naming the
   cause; the caller's own repeat changes nothing. Then it adds the issue to the board when absent
   (`gh project item-add`, idempotent; the auto-add workflows normally did it already), sets
   Status In Progress, assigns `@me`, and when the task's parent epic has stage Planning sets it to
   Building. Order: the call most likely to be refused first (scope, wrong project), the epic last
   because it is the only write on a second issue. A failure names the writes already done and the
   re-run finishes the claim. The epic step belongs here because "the first task is claimed" is
   exactly the event, and a separate step is one an agent forgets.
6. **The Action moves an epic to Ready For Test, and lives in this repository.**
   `.github/workflows/epic-stage.yml`, trigger `issues: closed`, one job that runs `gh` and
   nothing else: read the closed issue's `parent` and `issueType`; stop when there is no parent or
   the parent is not an Epic; read the parent's `subIssuesSummary`; when `completed` equals `total`
   and the parent's Epic stage is Building or Blocked, set it to Ready For Test through the same
   `gh project item-edit` call. A concurrency group per parent keeps two closes from racing.
   Reasons for this place: the trigger is a close, which the owner or a merge can do in the
   browser, where no verb of ours runs; the repository is where the board is linked; and a file
   with `gh` calls needs no install on the runner, while the compiled `qsm-forge` would. What it
   costs: the field and option names appear in the workflow as well as in the verbs. It holds two
   (Ready For Test, and the Building and Blocked it reads), so the duplication is small, and the
   proof run (task 4.2) breaks loudly if a name drifts.
   **Its token.** `GITHUB_TOKEN` has no permission for an organization project, so the workflow
   reads the repository secret `PROJECT_TOKEN`: a token with the `project` scope, the owner's own
   today, the App bot's installation token once that piece exists. Only the secret changes then.
   Unverified until task 4.2 runs it. A failed run is red in the Actions tab and leaves the stage
   as it was; `board-set --stage` is the hand correction. The workflow never comments and never
   posts, so nothing it does names an agent.
7. **The rest of the epic's stages are moved by people and the QA agent through `board-set`.**
   Planning when the epic is written, In Test when the QA agent claims it, Blocked when QA files a
   fix task, Done when the owner accepts. Closing the epic issue then is the issue verbs' `close`.
   There is no QA verb: `board-set --stage "In Test"` is the claim, and one verb per stage would be
   six verbs that each do the same write.
8. **Done is GitHub's for a task.** A merged pull request with `Closes #N` closes the issue (a
   GitHub rule for the default branch, protected or not), and "Item closed" moves the item to
   Done, "Pull request merged" does it for the pull request's own item. Reason: GitHub does it on
   the server for every merge, including one made in the browser, which no verb of ours would see.
   The cost is a board setting, which the owner switched on and measured. `board-set --status Done`
   stays for a hand correction. The moves In Review and Ready For Human Review are `board-set`
   calls, made by the agent when it opens the pull request and when CI is green with every finding
   fixed, until the App bot piece automates them.
9. **Errors are the project's own.** A refusal by GitHub (missing `project` scope, no such
   project, no such option, no such issue) is a `failed` outcome carrying `gh`'s words and the
   issue and project, exit 1; a bad call is exit 2; no repository is exit 4, as in the existing
   verbs. No retry and no second route.
10. **Same code shape as the review verbs.** Arg builders and mappers in `lib/github-board.ts`
    tested against recorded answers through `Run`; the real proof is a run on this repository.

## Risks / Trade-offs

- The fields are single-selects the owner can rename; the names then fail loud. Accepted: one
  board, one owner.
- A claim is several writes, not a transaction; the repeatable verb is the repair.
- `PROJECT_TOKEN` is a long-lived secret with project scope. Accepted until the App bot exists;
  it is stored as a repository secret and never printed.
- The Action's check depends on `subIssuesSummary` being current at the close event. Unmeasured;
  task 4.2 measures it, and the fallback is a search count, still `gh`.
