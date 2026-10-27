## Context

Today `qsm-tasks` serves the task port with `br` (beads_rust): one skill holds the model and a table
of `br` commands, an install script probes `br`, and the tracker is `.beads/issues.jsonl` in git.
Five other plugins touch it directly: worktrunk writes `.beads/redirect` into each new workspace,
memory's `orient` runs `br show` and `br list`, cockpit runs `br list` for a card, builder's lens
runs `br list` and `br create`, and toolbox lists `br` as a tool. The skills of plan, openspec,
essentials and review already say "the task tool" and name no binary, which is the one thing that
makes this change small for them.

Epic #3 settles the direction: GitHub Issues is the main task tool, reached through the verbs of the
`qsm-tasks` binary (sibling change `qsm-tasks-cli`, which also holds the flow table, `doctor`,
`setup` and the Action `epic-stage.yml`), `tasks.md` holds the steps of one change, `br` goes, one
board per repository, an epic is an issue of the issue type `Epic` whose tasks (type `Task`) are
sub-issues. A verb GitHub refuses fails loud and does nothing else. The board is org Project #1 of
`qsmark-labs` with a Status field for tasks and an Epic stage field for epics, set up by the owner
(`qsm-tasks flow` prints the options and their definitions).

## Goals / Non-Goals

**Goals:**

- One answer to "which tool is the main task tool", written in one skill, with the verb for every
  step the old table covered.
- No file in the marketplace reads or writes `.beads`, or names `br`, when this is applied.
- The skills keep working in the roles they already use ("the task tool"), unchanged.

**Non-Goals:**

- The binary, its verbs, the flow table, the board, the organization: `qsm-tasks-cli` and the
  maintainer.
- Triage of the open `br` tasks and untracking `.beads/`: the migration piece, run after this.
- A replacement for the removed readers (orient lines, cockpit card, lens task list).
- Pull requests, review threads and GitLab (qsm-forge): untouched.

## Decisions

### 1. The skill is the model and the flow; the binary is `qsm-tasks-cli`'s

The `task-tool` skill keeps its model rules (the fourth, the test-it task, becomes the QA stage;
see decision 3) and the working rules, and its `br` table becomes the verbs of `qsm-tasks`. The
plugin gains no code here: the binary, `qsm.json`, the install and `doctor` come from
`qsm-tasks-cli`, and this change deletes the `br` text and the old install probe's remnants. The
plugin declares no plug-in dependency. The contract other plugins use is unchanged: they say "the
task tool" and the skill is the one place that names verbs. The old requirement "One skill names br"
becomes "One skill names the verbs", the same ownership with the new tool.

The skill says what the binary cannot: who acts and when. `qsm-tasks flow` prints the names, the
definitions and each verb's guard from the binary's own table, so the skill copies none of them (a
renamed option edits one file), and holds the table below.

| Step | Verb | Who and when |
| --- | --- | --- |
| session start | `qsm-tasks ready`, `qsm-tasks list --mine` | the agent, first thing: the two lists are the old ready list |
| epic | `qsm-tasks epic "<goal>" --intent <file>` | the main agent after grilling, with the person's yes |
| task of a change | `qsm-tasks add "<change>" --epic <id> --spec <change-id>` | spec-propose, once the spec is written, never before |
| order | `qsm-tasks after <task> <blocker>` | the planner |
| claim | `qsm-tasks claim <task>` | the agent that builds; spec-apply at start |
| pull request open, CI and bots running | `qsm-tasks review <task>` | the builder, when it opens the pull request |
| CI green, every finding fixed | `qsm-tasks human <task>` | the builder, only then; the owner tests and approves |
| merge | nothing: `Closes #N` closes the task, the board sets Done | the owner merges |
| decision or spec-only task | `qsm-tasks close <task> --reason` | the main agent with the owner's word |
| not doing it | `qsm-tasks drop <task> --reason` | the main agent with the owner's word |
| epic ready for QA | nothing: the Action sets Ready For Test | GitHub |
| QA takes the epic | `qsm-tasks qa <epic>` | the QA agent only |
| QA finds something | `qsm-tasks finding <epic> "<title>"` | the QA agent only |
| QA finds nothing | report to the owner; the stage stays In Test | the QA agent |
| owner accepts | `qsm-tasks accept <epic>` | only on the owner's explicit word in the conversation |
| owner rejects | `qsm-tasks reject <epic> --reason` | only on the owner's explicit word |
| progress | `qsm-tasks note <id> "<text>"` | anyone, in the owner's name |
| work for later | `qsm-tasks defer <id> --until <date>` | the main agent |
| epic check | `qsm-tasks tree <epic>`, `qsm-tasks show <epic>` | after each task closes |
| feedback | `qsm-tasks feedback "<title>" --source <who>` | any agent, a subagent's one permitted create |

Alternative rejected: keep `task-tool` free of verb names and point at the binary's own help. The
agent would learn the flow from two places; one skill that names its verbs is one place to read.

### 2. Binding a change to its task: a first line in the body

`br` had an external-reference field; an issue does not. The task for a change carries the first
body line `openspec: <change-id>`, written by `qsm-tasks add --spec` or `spec` and read by
`find-spec`, which filters for the exact first line. spec-propose runs `find-spec` before it creates
anything. The exactness proof and the fallback to a label are the binary's (`qsm-tasks-cli` design
6 and its task 0.3), so this change adds no proof of its own and the skill relies on the verb.

### 3. Two flows: a task by Status, an epic by Epic stage, and QA instead of test-it

A task's flow is Todo, In Progress, In Review, Ready For Human Review, Done. The owner tests tasks
himself, with automatic tests and the review bots, so no agent sits between a task and him. A task
closes by the merge of a pull request with `Closes #N`, and the board's "Item closed" sets Done; a
task whose work has no pull request (a decision, a deferred item closed as won't-do) is closed with
the explicit `close` verb and a reason a reader in a month understands.

An epic's flow is Planning, Building, Ready For Test, In Test, Blocked, Done. Its first claimed task
makes it Building (`claim` does it), the last closing sub-issue makes it Ready For Test (an Action,
not a step), the QA agent makes it In Test, a finding makes it Blocked with a fix task under the
epic, and the fix task closing sends it back to Ready For Test by the same Action. The owner
accepts the QA result, and only then is the epic Done and its issue closed. The agent never closes
an epic on its own word.

This replaces the final test-it sub-issue. Reason: test-it was a task made to look like a stage, it
had to be blocked by every other task by hand, and it could be ticked by the same agent that built
the epic. A stage with its own agent, one that did not build the work and tests against the business
request and the acceptance criteria on the real path, is a stronger proof and costs no per-epic
issue. The QA agent runs in a Claude Code session on the owner's machine for now and on a
dedicated machine later; it is not built here, this change only states what the skills say about it.
Everything the skills post to GitHub is written in the owner's name and names no agent.

### 4. Deferred work is a label and a comment, not a status

GitHub issues have open and closed only; a board column could say `Deferred`, but the board is a
view the maintainer owns. The rule is one label `deferred` and a comment that holds the date or
condition, and the ready list excludes the label. A task is never silently closed or left open.

### 5. The feedback epic is found by its title

The instruction file and the web-research agent name the issue `Feedback on agents and tools` of
type `Epic` and the verb `qsm-tasks feedback`, never a number: a number in an instruction file is
the literal that goes stale (the `qsm-i1u` it replaces). The verb finds the epic by exact title in
the marketplace repository (the checkout `QSM_MARKETPLACE` names, so a subagent in another project
does not file into that project), comments on an open issue with the same title instead of making a
second, and labels a new one `source:<who>`. Feedback tasks keep the rules of today: the title names
where, a subagent creates only this kind. What the verb does is `qsm-tasks-cli`'s; the instruction
file says when.

### 6. The readers outside qsm-tasks go, apart from one write

| Reader or writer | Decision | Reason |
| --- | --- | --- |
| worktrunk `.beads/redirect` | removed | the store is on GitHub, a workspace has nothing to point at |
| memory `orient` task lines | removed (question 1) | session start must not need the network |
| cockpit Tasks card, `tasks` verb | removed (question 2) | a polled network read; GitHub's board is the view |
| lens open-task reads | removed (question 3) | same reason as the card |
| lens pen edit | kept, through `qsm-tasks add` (no epic) | it is a write of one loose task, the same verb the skill uses |
| toolbox `br` row, knip `br` | removed | no `br` |

Removing a reader removes its dependency on qsm-tasks (memory, cockpit). The lens keeps it, for the
one write.

### 7. Order of work

Readers first, qsm-tasks last. `br` stays usable until nothing calls it, so every intermediate state
builds and every test that passed before still passes. Each reader removal is also the place its
test is deleted or rewritten: a test of a removed behaviour is removed with it, never kept green by
a fake `br`.

### 8. Evals use a fake `qsm-tasks`

The evals of qsm-tasks (`task-tool-last-child-of-epic`, whose grader reads `.beads/issues.jsonl`),
qsm-openspec, qsm-plan and qsm-review scaffold a repository with `br init` and `br create`. They get
a `qsm-tasks` stub on PATH that records its arguments to a file and prints a canned answer for the
reads (`ready`, `list`, `show`, `find-spec`); the graders read that file. The real verbs against
real GitHub are proved once by `qsm-tasks-cli` and by the epic's QA stage. Alternative: real
`test:` issues per eval run, rejected as noise on the public repository (question 4).

### 9. The instruction file names the tools, in the same three columns

`plugins/qsm-setup/instructions/CLAUDE.md`, table "Where things live", is the one place an agent
learns on every task which binary serves a role; skills and agents keep saying "the task tool". The
table keeps its three columns (Place, Answers, Changes): a fourth column for verbs would be empty on
five of the seven rows, and the daily verbs fit the Answers cell of the two rows that have them. Two
rows change, verbatim:

```text
| the task tool, `qsm-tasks` | what is unfinished, in what order, and who has it, never a TODO in prose; an epic holds the intent and acceptance criteria of a piece of work and a task is one spec change under it; daily verbs `qsm-tasks ready`, `list --mine`, `show <id>`, `claim <id>`, `note <id> "<text>"`, and `--help` for the rest | daily |
| the memory tool, `qsm-memory` | what a person and the model said in every earlier main session on this machine, saved by a hook and searched by full text, never acceptance criteria; plus one short-term note for the next session, which expires; daily verbs `qsm-memory search "<words>"`, `show <id>`, `note "<text>"` | never by hand, except the note |
```

The row in group 10 of tasks.md replaces the two existing rows `the task tool` and `the session
archive (qsm-memory)`; the sentence "never by hand, except the note" stays the Changes cell of the
memory row.

## Risks / Trade-offs

- **Offline, tracking stops.** One path, no fallback. The skill's caveats say so.
- **The verb names come from `qsm-tasks-cli`.** Group 1 of tasks.md reads that change as applied
  and fixes any name that moved; the spec's scenarios describe results, not flags.
- **`marketplace-lens` is an active change** whose requirement "An edit becomes one task in the task
  tool" is not in the main spec yet. If it archives first, this change modifies it; if not, its
  tasks 3.3 and its design 14 are reconciled when it is applied. Recorded in tasks.md.
- **A rate limit or a missing `project` scope** surfaces as the verb's failure with the cause; the
  skill names `gh auth refresh -s project` as the fix.

## Migration Plan

This change adds no data migration. The 98 `br` tasks become issues in the migration piece, which
needs the `.beads/` file readable until it finishes, so `.beads/` and the `br` binary stay on the
maintainer's machine until the triage is confirmed. Group 11 of tasks.md, the sweep that confirms
nothing names `br`, is applied after that. Nothing here deletes `.beads/` itself.
