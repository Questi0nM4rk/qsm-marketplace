## Context

`plugins/qsm-forge` has `qsm-forge gh <verb>` and `gl <verb>` for review threads, `lib/github.ts`
(arg builders, mappers, a forge that runs one call and maps the other), `lib/exec.ts` (the `Run`
function type, so a test hands in a recorded answer), `lib/remote.ts` (repository from `origin`
or `--repo`), a `qsm.json` that declares every verb, and a hook that blocks raw review calls.
Piece 1, `forge-issue-verbs`, adds issue verbs beside them; this change adds board verbs.

Measured on this machine (gh 2.102.0, `project` scope granted): `gh project item-add` and
`gh project item-edit --url ... --field Status --value "In Progress"` select by name, so no node
id is needed; a board of this account lists Status options Todo, In Progress, Done and two
enabled workflows, "Item closed" and "Pull request merged" (GraphQL `projectV2.workflows`);
`repository.issue.projectItems` answers an issue's board, Status and assignees in one call.

## Goals / Non-Goals

Goals: an agent adds, moves, reads and claims through four verbs with no node id and no raw
`gh project`; the board is named by arguments, so the move to an organization changes nothing in
the code.

Non-Goals: creating the board, a cross-repository board, GitLab, listing a whole board, a guard
hook for board calls.

## Decisions

1. **Four verbs under `gh`, hyphenated like `resolve-all`.** `board-add`, `board-set`,
   `board-status`, `claim`. The issue is a positional number and `--repo` is as in every other
   verb; the board is `--owner <login> --project <number>`, both required, never defaulted.
2. **The Status is one of three exact names, checked before any call.** `Todo`, `In Progress`,
   `Done`. Anything else is a usage error (exit 2) listing the three, so a typo never reaches
   the forge. The board's own option names are the contract; a board that renamed one fails
   loud with GitHub's answer.
3. **Writes go through `gh project item-add` and `item-edit`, the read through GraphQL.**
   Add and edit are separate calls on GitHub, so `board-add --status` is add, then edit; `item-add`
   on an issue already on the board returns the existing item, which makes the verb idempotent. The
   read asks the issue for its `projectItems` and picks the one whose project owner and number
   match, because `item-list` pages by 30 and would need a scan.
4. **Claim is board first, assignee second, and says what is done on failure.** It adds the issue
   to the board if absent, sets In Progress, then assigns `@me`. A closed issue is `blocked`. An
   issue assigned to another login is `blocked` naming that login; one assigned to the caller
   is a repeat and changes nothing. If the assignee call fails after the board changed, the verb
   fails (exit 1) and names the board change as done; running it again finishes the claim.
5. **Done is not a verb.** A merged pull request with `Closes #N` closes the issue (a GitHub
   rule for the default branch, protected or not), and the board's built-in "Item closed" workflow
   moves a closed item to Done; "Pull request merged" does the same for the pull request's own
   item. Reason: GitHub already does it on the server for every merge, including merges made in
   the browser or by a person, which no verb of ours would see; a verb would be a second path
   that runs only when the agent remembers. The cost is a board setting, so the spec requires the
   two workflows to be on and the maintainer's board-creation step checks them (they are on by
   default). `board-set --status Done` stays for a hand correction.
6. **Errors are the project's own.** A refusal by GitHub (missing `project` scope, no such
   project, no such Status option, no such issue) is a `failed` outcome carrying `gh`'s words and
   the issue and project, exit 1; a bad call is exit 2; no repository is exit 4, as in the
   existing verbs. No retry and no second route.
7. **Same code shape as the review verbs.** Arg builders and mappers in `lib/github-board.ts`
   tested against recorded answers through `Run`; the real proof is a run on this repository's
   issue.

## Risks / Trade-offs

- The Status field is a single-select the maintainer can rename; the three names then fail loud.
  Accepted: one board, one maintainer.
- A claim is two writes, not a transaction; the repeatable verb is the repair.
- `gh project item-edit --url` needs a gh new enough to have it; doctor already checks `gh` on
  PATH and the first call names a too-old `gh` through its own error.
