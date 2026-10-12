## Context

`bun run eval <plugin>` (`.gates/plugin-eval.ts`) runs `claude plugin eval` on a temporary copy of
the plugin with a sonnet judge and copies `evals/results/` back. `claude plugin eval` runs 3 runs
per case and a with-without ablation by default, and writes `aggregate-result.json`, where
`cases[].arms.with[]` and `cases[].arms.without[]` hold per run `passed`, `turns`, `score` and
`graders[]`.

The first full pass on 2026-10-08 measured 55 of 96 cases at the bar. Of the 41 below it, 28
failed with the plugin, 11 passed without it and 2 did both. The person reviewed every one and set
the direction recorded below: grade the agent's thought process and output on a real problem,
not a general answer to a random question.

What the eval sandbox can do, measured on Claude Code 2.1.293 with `socat` installed:

| Need | Measured |
| --- | --- |
| Bash, Write, Edit | run with `--allow-tools Bash Write Edit`; writes land in the workspace, `/tmp` and a temporary HOME |
| binaries on PATH | `bun`, the task tool, `qsm-index`, `qsm-memory`, `jq` found; `git` hidden |
| network | denied |
| host files | an absolute path outside the workspace is not readable |
| fixture files | `case.yaml` `context.scaffold_script`, run with `--scaffold` as the person, outside the sandbox, before the run |
| steps | `max_turns` enforced; `turns` per run in `aggregate-result.json`; `tool_used` takes `min` and `max` per tool |
| thought process | an llm grader with `focus: trace` sees the first and last 12 messages of the run |
| MCP servers | mocks in `evals/mocks/<server>/<tool>.md`, or the real server with `--allow-real-servers` |
| plugin install | not run; a binary is reachable only from the person's PATH |

## Goals / Non-Goals

**Goals:**

- One bar every case is measured against, and a verdict line that applies it.
- Every skill and agent covered by a fire case and a scenario case that meet the bar, and every
  plugin by one negative case.
- Graders that judge the thought process and the output in one to three points.
- The skill decisions the person made in review (decision 8) and the 12 hand-on fixes.

**Non-Goals:**

- No gate on the bar: it never blocks a commit, a push or the exit code, because an eval cannot be
  auto-fixed and every run costs a model call.
- No new eval framework, no result database, no trend history.
- No change to the run count (3). Every model is named: the judge is haiku (claude-haiku-5-5),
  the cheapest model that grades well, and the agent under test runs on
  sonnet by default, because the child would otherwise inherit the person's default model (opus).

## Decisions

1. **The bar.** A case meets the bar when every with run passed (3/3) and at most one without run
   passed (1/3). A `negative` case meets it on 3/3 with alone, because its without arm passes by
   design. Alternative rejected: an average score threshold, because a mean hides the one run
   where the rule was ignored.
2. **The verdict line lives in the wrapper** and prints, per case, the counts and the mean turns
   per arm: `<case>: meets bar (with 3/3, without 0/3, turns 5 vs 11)`, then
   `<n>/<total> cases meet the bar`. The exit code stays the eval's own. Turns are printed because
   a skill that reaches the same answer in fewer steps is a measured win (the index benchmark).
3. **Three kinds of case, tagged in the frontmatter**, as the skill-standards skill states:
   `fire` (the skill loads on the words a user types), `scenario` (the skill changes how the agent
   works on a problem with several steps, compared with the same problem without the plugin), and
   `negative` (one per plugin: the skill stays quiet on an unrelated ask). A case is named after
   its problem, never `*-trigger`.
4. **A grader judges the thought process and the output, in one to three points**, with
   `focus: trace` when the process matters. It grades only what the skill changes and what the
   prompt makes necessary, never a phrase copied from the skill. A regex is case-insensitive.
   Alternative rejected: a checklist of five or more ANDed points, because it fails good answers
   on one nit (css-ui, tui-ui, grilling, vault-note).
5. **The sandbox is used, not avoided.** The wrapper passes `--scaffold` and
   `--allow-tools Bash Write Edit`, so a scenario can seed a small repository with
   `scaffold_script` and let the agent run it. What the sandbox still lacks (web, git, the
   person's task store and memory) is stated in the prompt to both arms, and the agent says what
   it would run, save or search, where and why; the grade falls on that plan. Talking it through
   is enough; nothing has to be created.
6. **Scenario depth comes from sources.** Scenarios for distributed-systems, domain-modeling,
   software-design and refactoring are built from the rules, questions and edge cases of the
   person's books in `~/Documents/Books` (Designing Distributed Systems, Learning Domain-Driven
   Design, A Philosophy of Software Design, Software Design, Refactoring); subagents from a
   published guide on working with subagents. The plugin task reads the source and writes the
   scenario; nothing from the book is copied into the repository beyond the case.
7. **The index proves itself on fewer steps.** A qsm-index scenario seeds a read-only copy of the
   marketplace through the scaffold (the wrapper writes the repository root to `.eval-repo` in its
   copy, because a scaffold gets a scrubbed environment), asks fixed multi-hop questions with known
   answers under a low `max_turns`, and compares correctness and turns with and without the plugin.
8. **Skill decisions from the review**, landed in the owning plugin task:
   - framework-tests is deleted; test idiom and coding practice live per language in the langdev
     plugins.
   - run-and-verify shrinks to a few sentences: done means the running system was seen doing what
     was asked, ask once when nothing is written, write the run down after a go.
   - prompting becomes the prompting guide for this marketplace: why and what over how, how to
     use and not misuse iron laws, and maker notes; per-model rows go unless an eval measures them.
   - book-to-skill produces one self-contained skill document of the book's rules and ideas that
     names the book only as its source ("we follow the X architecture, as in Y"), never its
     chapters or pages.
   - fish-dev keeps only the caveats models get wrong; the plugin exists for its hooks.
   - python-dev and typescript-dev scenarios give no extra instructions and grade typing (custom
     types with validation at the mapping) and clean code; bun-dev gets a scenario only Bun's own
     rules decide, or is removed.
   - shell-dev grades the shebang (`#!/usr/bin/env bash`), external dependencies and style.
   - toolbox keeps only what `--help` cannot tell; command-shadowing aliases were removed from the
     person's zsh instead of documented.
   - setup is a proactive installer: it suggests plugins, the usage skills that review prompting
     and cleanups, and asks about the person's way of working; graded on that.
   - memory is graded on whether and how it uses the memory tool and what it does with the output.
   - refactoring asks for a full index and works through it, with a better plan than the plain
     model.
   - the task skill (qsm-tasks) is graded on closing: after finished work or a decision the tasks
     are updated, closed with a reason, and an epic whose children are all closed is closed.
   - forge is graded on its tools being faster and more consistent than the plain model's way.
   - openspec, plan and builder scenarios ask for specs and the next step in the qsm flow (langdev,
     tests, the task tool, grilling) for tasks of different size, and are compared with the plain
     model's plan; spec-archive covers closing the tasks bound to the change.
   - claude-md-trim seeds a long CLAUDE.md with doubled rules (synthetic, nothing from this
     machine) and grades each cut with its reason.
9. **Removal.** A skill whose scenario still passes without the plugin after it was made harder is
   proposed for removal to the person, with the counts.
10. **The loop per item.** Run the plugin. A case below the bar is re-run once (a judge vote can
    flip). Still below: rewrite the case or the skill, at most two rewrites. Still below: the miss
    report in the plugin task (counts, what the case tests, why it fails, one or two fixes).
11. **One child task per plugin under one epic.** Each task owns that plugin's `evals/`, skills and
    agents. The wrapper task blocks all others.
12. **The eval gate comes last.** `bun run validate` fails on a skill or agent with no `fire` and
    `scenario` case, a plugin with no `negative` case, and a case-sensitive regex grader. It lands
    after every plugin task, because today every case is tagged `trigger` and the gate would block
    every commit.
13. **Fire and negative cases run with no baseline arm and a two-turn cap.** The wrapper runs them
    with `--ablation none` and `max_turns: 2`: a fire case asks whether the skill loaded on the
    words, a negative case whether it stayed quiet, and neither needs a without arm to answer. They
    meet the bar on 3/3 with alone. Scenarios keep the with-without ablation. The wrapper makes one
    call per kind, because the rule for repeated `--tag` is not documented.
14. **Scenarios default to plan-only replies.** The agent does not execute; it answers in the fixed
    shape `Approach:` (how it reads the problem), `Flow:` (numbered steps of the full solution) and
    `Next step:` (the one next action or skill), with `max_turns: 3`: one turn to load a skill, one
    to read a seeded file, one to answer. A scenario runs for real only where the tool call is the
    value (the task skill closing a task, a memory search). Alternative rejected: executed scenarios
    by default, because they spend turns on the work and grade the outcome of the sandbox, not the
    skill's decision.
15. **Unchanged cases are skipped.** After a run the wrapper stores, per case, a hash of the case
    directory and the plugin's `skills/`, `agents/` and `instructions/`, with the verdict, in
    `evals/results/case-hashes.json` (gitignored). A case whose hash is unchanged and that met the
    bar is printed as `meets bar (unchanged, skipped)` and not run; `--force` runs everything, and
    `--case` or `--tag` from the person runs exactly what was asked.
16. **Every regex grader is broken before a model runs.** A case with a regex grader carries
    `samples/pass.md` (a right reply) and `samples/fail.md` (the plausible wrong reply a plain model
    gives). The wrapper checks, before any run, that the regex with its flags matches pass and does
    not match fail; a missing sample or a mismatch stops the wrapper with the case and grader named
    and a non-zero exit. A grader that cannot tell the two apart would pass a model on luck.

## Risks / Trade-offs

- [3 runs is a small sample] → one re-run before any rewrite, and the miss report names the
  counts.
- [Bash in the eval runs real commands] → the OS sandbox confines writes to the workspace and
  denies the network; the scaffold runs as the person, so a scaffold script is reviewed like code.
- [Cost: one full pass is about 600 runs (estimate, 100 cases x 2 arms x 3)] → fire and negative
  cases run one arm on two turns, scenarios are plan-only on three, unchanged cases are skipped,
  and each plugin call carries `--max-cost-usd 5`; one plugin per task, `--case` to re-run one
  case.
- [A rewrite to pass the bar bloats a skill] → the 12 KB cap and the aim of 8 KB hold; a skill
  that needs more text to pass is a miss report.
