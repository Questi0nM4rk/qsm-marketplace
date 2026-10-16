---
name: skill-standards
description: "Use when writing, reviewing, refactoring, or cutting a skill, agent, or command prompt in this marketplace: how it opens, what its description must do, what the body holds, and the eval that decides whether it is kept. Triggers: write a skill, review this skill, improve this skill, is this skill any good, skill description, should this be a skill, write an agent prompt, napis skill, zkontroluj skill. The prompting guide is the prompting skill; building one into a plugin is add-skill; the file contract of a plugin is the add-plugin skill."
---

# Skill Standards

The agent that reads a skill has none of our context. Give it why the skill exists and what done
looks like, and it decides well in the case the skill never named. This is the bar for a skill, an
agent or a command prompt. The prompting guide is the prompting skill, building one into a plugin is
add-skill. The scope is always smaller than the agent thinks: the simplest version that does the job
is the right one.

## Shape

| Part | Holds |
| --- | --- |
| description | the trigger, in the words a user types |
| opening | the purpose: the gap, who it serves, the outcome, what it will not do |
| body | the maintainer's stance, thresholds, commands, each rule with its reason |
| `## Red flags` | symptoms the agent can notice, each with action and reason |
| `## Say it in the reply` | what the reply must show |

One sentence lives in one part. Move a repeat, do not copy it.

## Rules

- Description: third person, key case first, then phrases a user types, under 1,024 characters.
  Name the neighbour skill that owns what this one does not, because two descriptions matching one
  request is a coin flip.
- Cut every line the model already knows. A skill holds only what the model does not do unaided:
  our stance, our numbers, our commands. A skill whose eval delta is zero is cut.
- Plain words, no capitals for emphasis, no MUST. A shouted rule is applied wider than meant.
- Give the reason with each rule. A rule with no reason is deleted.
- Prefer one positive example to a list of "never" lines.
- A constraint that must hold every time is a hook, and the skill names the hook.
- A skill that tells an agent to test says: the least work that runs the real path end to end, never
  a test that restates what was just written.
- One subject per skill, cap 12 KB, aim for 8, no `references/`. Over the cap: split into two.
- No dates, no history, no test evidence in the body.

## Evals

Every skill and agent ships an eval, written before the body, so the first run shows what the
model does unaided. A skill without one is not merged, because an unproven skill may never load or
may change nothing. The cases live under the plugin's `evals/`, one folder each, tagged in
`case.yaml` when the case has one, else in the prompt's frontmatter:

| Tag | What it proves | Grader | Runs |
| --- | --- | --- | --- |
| `fire` | the skill loads on the words a user types | `tool_used` on `Skill`, or a regex on the named agent | with only, `max_turns: 2` (an agent 4) |
| `scenario` | the skill changes how the agent works on a hard problem | one to three points | with and without |
| `negative` | the skill stays quiet on an unrelated ask, one per plugin | `tool_used` on `Skill` with `max: 0` | with only, `max_turns: 2` |

Map the skill into its steps first: fire, probe, decide, act, report. A step that code could do is
checked deterministically; only a judgement gets an `llm` point. The step that fails first is the
one to fix, often one sentence where the skill says nothing.

A scenario is a hard interview question answered from the head. It opens by naming the skill
(`Use the debugging skill.`), because firing is the fire case's job and a scenario that never loads
its skill measures nothing. It plants a situation with a known answer and its traps: a symptom far
from its cause, a claim someone relayed that is wrong, a change that looks safe. Information may be
incomplete on purpose; the grade is where the agent would look, why, what it connects, what it
does first, and how it would prove it. The reply has a fixed shape, `Approach:`, `Flow:`,
`Next step:`, plus `Report:` when the work is handed to someone. Never ask the model to think out
loud or name a field `Thinking:`: the API refuses it as reasoning extraction. Execute for real only
where the tool call is the value (closing a task, searching the archive, keeping a log).

The grader judges the thought process and the output, in one to three points:

- Grade only what the skill changes. A point the plain model passes as easily is deleted, not
  reworded, because it measures nothing.
- Grade only what the prompt makes necessary, and give both arms the words the answer is graded
  in (`fix`, `scoped`, `multi-session`), so the point falls on the decision, not the vocabulary.
- Prefer a regex on a planted answer to an `llm` point. A regex is case-insensitive (`flags: i`;
  an inline `(?i)` throws), and its case carries `samples/pass.md` and `samples/fail.md`: the eval
  runner refuses to spend a run until every regex matches the pass and misses the fail.
- An `llm` grader opens with `Intent of this eval: <one or two sentences>`: the situation the person
  is in and what behaviour would make them trust the skill. The judge reads it first and the lens
  shows it as the case summary.
- An `llm` point judges the reply (`focus: last_message`), because a scenario asks the agent to
  say in words what it would do and why, and a long trace buries that reply under tool output.
  Grade a tool call with `tool_used`, not a judge over the trace. The trace is for debugging a
  failed case (`--keep-temp`).
- Read a failing reply before trusting the grader: a worker that found a better path than the one
  the case planted is a case to fix, not a skill.

When the sandbox lacks what the job needs (web, git, the task tool), the prompt says so to both
arms and the grade falls on the plan. The bar: every run with the plugin passes (3 of 3) and at
most one without does. `bun run eval <plugin>` skips a case that met the bar and has not changed;
`--case <case> --runs 1 --keep-temp` keeps the trace while iterating. A skill whose scenario still
passes without the plugin after the case was made harder is proposed for removal, because it adds
bytes and no behaviour.

## Working the lens edits

The person edits a skill, an agent or a plugin text on the marketplace lens. Saving makes one task
and writes no file, so the work is yours, with them. When a task of kind edit reaches you (the hook
shows it, or `qsm-builder lens tasks <plugin>` lists it):

1. Check it is current. A task marked stale names a file that changed after the edit was made, so
   read the file now and say what differs. Never apply a stale task as it is.
2. Show the person three things: the text before, the text after, and their note. Then say what you
   would do, or why you refuse. A `SKILL.md` that would pass 12 KB is a split. A change of
   behaviour goes through `spec-propose` first. An edit that breaks a rule above is proposed again
   in better words, with the reason.
3. Ask for a yes and write nothing before it. A silent write is the one thing the lens was made to
   prevent.
4. After the yes, apply it, run the plugin's eval for an edited skill or agent (`bun run eval
   <plugin> --case <case>`), and commit the change with a message that names the task.
5. Close the task in the task tool with what was done. A refused task is closed with the reason, so
   the person sees the answer on the page.

The reason for the order: the person reads at the level of intent and use case, and an edit made
under their eyes is one they can own.

## Red flags

- When the description summarises the body, rewrite it in typed words, because the harness matches
  what users type.
- When the description says "and also", split the skill, because the unneeded half still loads.
- When a body line is textbook, delete it, because it adds bytes and no behaviour.
- When the purpose appears mid-body, move it to the opening, because rules are read through it.
- When a constraint says "remember to", write the hook, because prose is forgotten under pressure.
- When a skill has no eval, write the fire and scenario cases first, because an unproven skill may
  never load or may change nothing.

## Say it in the reply

One line: kept or cut, the case run, pass or fail, the with and without delta. Name the byte size
when near the cap.
