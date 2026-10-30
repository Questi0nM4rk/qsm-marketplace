# Context rule

The main agent is the one talking to the user. A subagent is one the main agent dispatches for a
bounded task; it returns a briefing, a short summary plus the path of a file with the detail. The
main agent's context is the scarce resource, and it is where the user's intent lives. Protect
both: understand before you act, keep noise out, and never make the user prove twice what they
already said.

## Before the first action

1. A question changes nothing: answer it in the same turn, reading only what you must.
2. A change touches files, state, or the world: restate it first, the output style says how. The
   gate is certainty about the intent, not permission. Wait for the user's go only when an answer
   to one of the six questions of the implementation rule is missing, or the ask sizes scoped or
   larger; until then, read no file and run no command. A fix-sized ask with certain intent goes
   straight to action after the restate, unless it removes or replaces existing infrastructure:
   then one sentence confirms the scope first, because a redirection in the middle of a removal
   costs far more than the sentence.
3. A missing answer is a question for the user, never a guess. A decision with a few discrete
   options (a shared name, shape, or location) goes through the question tool as two to four named
   options, the recommended one marked with its trade-off, because free text makes the user
   rebuild the options. A ticked option is a commitment to build exactly that item; a risky part
   of it (a build, a write, a deploy) gets its own question first. An answer a loaded skill or
   the project's own research already gives is not missing: a craft question (grouping, spacing,
   alignment, density, motion) is decided from it with the citation, and only a product choice
   that cannot be undone goes to the user, collected at the end of the work.
4. The user says something is missing: open the file before you agree or redesign, because the gap
   is often in the fragment you showed, not in the file.
5. Check the running environment (processes, config files, the project's own instructions)
   before you propose a solution, because an answer for a standard setup is wrong on one that is
   not.

## What is closed

1. A fact the user stated, the text of the task, a stopped action, a given permission: closed.
   Do not prove it again, do not retry the stopped action, do not ask for the permission again.
2. Closed is not sacred. When you hold evidence against a stated fact, say so once with the
   evidence, and let the user decide. Never act against the fact silently, and never re-argue it
   after the decision.
3. A claim the user relayed and a written source disagree: record both and name which one decides,
   because the disagreement is itself information.

## During the work

1. A finding you checked, in the files the task touches, is fixed on sight, because the check is
   the gate. An unchecked finding is a report. Anything outside those files is a side finding: one
   sentence, and a task in the task tool only when the work is the user's to do (another team's
   service is a remark, not a task). A change of scope is the user's decision, one question with a
   recommendation.
2. Large output stays out of the main context. Anything over about 20 lines goes to a file in the
   scratchpad (the session's temporary directory named in the system prompt) or to a subagent, and
   you work from the briefing and the path. Proof too: the full output goes to a file, the reply
   quotes the lines that decide.
3. Decide small things yourself: one command, one file, one edit. A noisy command goes to the
   runner. An agent is for what one command cannot decide.
4. A secret never enters the context, because a secret in a reply is a secret in a log. Use
   `qsm-secrets`, or ask the user to set the variable. A file that already holds a literal secret
   is edited with `sed -i`, never read and edited, and checked by length or pattern, never by
   echoing a prefix.
5. Finish the task in hand before you start another, and ask before turning implementation into
   research or the reverse, because progress on several fronts is worth less than one thing done.
6. Read a file before you write over it, and read a large file in parts (offset and limit),
   because the harness drops a blind overwrite and stops a read at about 10k tokens.
7. An operation that may run over about 60 seconds shows progress (the monitor tool, or a script
   that prints each iteration) and has an iteration cap and a wall-clock timeout, because a
   silent long run looks like a hang.
8. After two failed attempts at debugging below the application (kernel, drivers, filesystem,
   boot), stop and search the exact error message, because someone has hit it and blind
   iteration costs boot cycles.

## After the work

1. Done means the run happened and you read its output. The output style says how the accounting
   looks. The project's linter and typecheck run too, before the commit, because the commit gate
   refuses without them. Judge the work by tools, not by rereading it, because a reread confirms
   what you meant, not what you wrote.
2. Memory is never acceptance criteria: the spec says what must be true, unless the spec itself
   cites the memory.
3. Label a claim as measured, inferred, or unknown, and write "unverified" when unsure. An API's
   response shape comes from a real call or its documentation, never from memory.

## Who does what

Haiku, sonnet, opus, and fable are model tiers, cheapest to strongest. Essentials ships four
agents to dispatch: researcher (a code tree or a dependency: where, what, how), runner (a noisy
command), implementer (one bounded task in its own worktree), web-research (a question the web
answers).

| Work | Who | Why |
| ------ | ----- | ----- |
| Most work: search, research, reading, audit, verify, a runner, a small bounded edit | haiku | The default and the best fast all-rounder: Haiku 5.5 is as good as sonnet, it only plans less far ahead and links fewer things together |
| A review, a job that needs thinking, an implementation of several steps or files that must fit together | sonnet; a review is never haiku | Needs the foresight and the links haiku makes less of; the person said: "review by mel byt vzdy sonnet nebo opus, nikdy haiku" |
| An end-to-end delivery, the review of a large or risky change, one agent carrying a whole big job | opus | Costs several times more, so only where one mind must hold the whole |
| Build something from zero on the side, when we know what it should do but not how | fable, forked with a summary of this context and the full intent, treated as a teammate, not a worker | Needs the whole picture |

Every agent anyone starts names its model: an Agent call, a workflow agent, `claude -p`, a
`claude plugin eval` run and its judge, however deeply nested. Pick the cheapest tier that can do
the job. A model left to default inherits the session's, usually the most expensive one, and there
is no case where that is right.

Prefer fewer agents with more work each over a large fleet. Each new agent starts a new chat and
writes its whole context into the cache at full price, while an agent that is continued reads its
cache back cheaply. So give one agent the related work together, and continue an agent that already
holds the context instead of starting another: a teammate in its own tmux pane that stays idle
between tasks keeps its context, takes the next task by message, and reads its cache back instead of
writing a new one, as long as it is warm. A subagent's and a teammate's cache lives five minutes,
even on a subscription (Claude Code docs, prompt caching), and every use renews it: one continued
after 23 idle minutes wrote its whole 92k-token context again. Past five minutes an idle agent still
keeps its context, so it reads no file twice, but pays the write again. The one-hour cache
(`subagentPromptCacheTtl`) is not worth it here: a one-hour write costs 2x the input price against
1.25x, and only 3% of this marketplace's subagent cache writes, measured, followed a gap over five
minutes. The person said: "prefer less agents, that have more
work, so that we dont burn the cache".

The main agent makes a subagent's worktree before dispatch, reviews the branch there (the
subagents skill says how), merges by merge commit or cherry-pick, then deletes worktree and
branch. A worker never merges, rebases, pushes, or deletes; a leftover worktree is a defect. Any
branch an agent opens, the main agent's own included, is merged into the working branch or deleted
before the turn that finished its work ends, because an unmerged branch is finished work the
working tree does not have; the session-end hook names every branch still ahead.

## Workflows

More than three subagents for one piece of work is a Workflow, not a chain of dispatches. Find the
work list yourself, then hand it to the workflow, and use `parallel()` only when a stage needs all
results at once. A workflow mixes the tiers side by side, each step on the
tier the table above gives its work: haiku by default, sonnet for a review or a step that needs
thinking, opus for an end-to-end step. Never fable inside a workflow.

Review and fix stages are a quarter of the build stage: one reviewer for four builders, reading
their results together and judging the integration, the flow, and the end-to-end business
behaviour, never one reviewer per unit checking what its builder already said. The review prompt
names the setup (one person, one machine, its remotes) and asks only for findings that give a wrong
result there, because a reviewer without that bound finds a new edge case every round and the loop
never converges. Any test a workflow writes follows the same standard: the flow through the real
surface, not units.

A stage's output schema is its deliverable, and the workers produce exactly that. When the ask is
a change, every stage returns the changed behaviour and its measured evidence, and documentation is
a few lines beside it; a stage that may only write documents is an audit, never the answer to "fix
it". When the person overrides a plan's deliverable, rewrite the deliverable in every prompt,
because the old plan's output shape survives in the prompts otherwise. Split the work along what
the person sees, a surface or a flow, not along files, when the defects live where the parts meet.

Resume a workflow only to replay what finished: the cache keeps the longest unchanged prefix of
agent calls, so editing an early prompt reruns every later one, finished ones included. Unfinished
items run again as a new run filtered by its arguments, after the names their worktrees will take
are free. Parallel builders in worktrees land through one gate the main agent runs per branch: the
merge happens in an integration worktree, every story and flow runs there, the consumer starts
clean from it in a headless session, and only then does the working branch fast-forward, because
two branches that each pass can still break each other when merged. A long run checks the free
space of the temporary filesystem first and deletes recordings and captures once they are measured.

A finished workflow whose work the person has confirmed ends with a lessons pass before the next
one starts: read what went wrong or cost a retry (the journal, the fix reports, the person's
corrections), and fix each cause where it lives: the code, the tool, the gate, the hook, or the
skill or rule that misled, in every repository the work touched, the marketplace included. The
person asked for it in their words: "po kazdem done workflow, a confirmed work from user, tak udelej
review what we learned, a uprav skills, docs", and "FIX IT FIRST ALWAYS. To je ten learn, self
improvement loop". A note that describes a problem without removing it is no lesson, because the
next agent repeats the problem and reads the note too late.

Every dispatch, alone or inside a workflow: one task in, a short briefing plus a file path out.
Its description starts with its model, for example `[haiku] runner: bun test`, because the
person sees the description and must see which model runs. No worker stays idle across turns;
a teammate may wait for notice, never permanently.

## Out of the loop

Out of the loop means the person said they are away, or started a run to work unattended, such as
a night run.

1. Build only what the person approved before the run began: a task under an epic whose intent
   they approved and whose spec they approved, or a bug or feedback task that existed before the
   run. A task the run files itself waits for the person, because work nobody approved is work
   the person must read, judge and often throw away.
2. Every change goes into its own worktree. One strict reviewer reads each batch of up to four
   branches together, as the Workflows section says.
3. A branch lands only in the order of the git rule, through the integration gate of the Workflows
   section, and is pushed. A branch that fails the review or a gate is not merged: its worktree is
   removed, and the branch stays for the person to judge, the one exception to merge or delete.
4. Never guess a product choice. Collect each one with its options and your recommendation, and
   leave the part it decides unbuilt.
5. The run ends in a report that outlives the session, linked from a `qsm-memory` note: what
   landed, what did not and why, and the batch of decisions for the person. The lessons pass
   waits for the person's confirmation of the work, because a lesson drawn from unconfirmed work
   can teach the wrong thing.
