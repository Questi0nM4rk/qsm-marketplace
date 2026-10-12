## Why

An eval that passes without the plugin proves nothing, and one that passes with it only some of
the time proves the rule is not followed. The first full pass measured 55 of 96 cases at the bar.
Most misses were the eval's fault, not the skill's: graders that demand five to seven points the
prompt never asks for, prompts the model answers from general knowledge, and a sandbox the cases
never used (Bash was never granted, files never seeded). Cases test whether a skill loads and
whether a general answer looks right, not how the agent works on a real problem. 10 agents and one
skill have no case, and qsm-memory has no evals at all. The skills report found 12 small gaps
where one skill does not hand on to the next.

## What Changes

- One bar for every case: it passes in every run with the plugin, and in at most one of three
  runs without it.
- Every skill and agent has a `fire` case and a `scenario` case, every plugin a `negative` case. A
  scenario is a problem with several steps, graded on the agent's thought process and output in
  one to three points that only the skill's rule decides.
- The eval wrapper seeds scenario files and grants Bash, Write and Edit in the sandbox, and prints
  one verdict line per case with the mean turns per arm. It never changes the exit code.
- What the sandbox still lacks is stated to both arms, and the agent's plan is graded instead.
- The skill decisions from the person's review land: framework-tests is deleted, run-and-verify
  shrinks, prompting becomes this marketplace's prompting guide, book-to-skill writes one
  self-contained skill, and others named in the design.
- A skill that still passes without the plugin after its scenario was made harder is proposed for
  removal. A case still below the bar after two rewrites gets a miss report in its plugin task.
- `bun run validate` fails on a missing case kind or a case-sensitive regex, added last.
- The 12 hand-on fixes from the skills report land in the skills they name.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qsm-marketplace`: adds the eval bar, the case kinds, the wrapper's verdict line and the eval
  validation.

## Impact

- `.gates/plugin-eval.ts`: sandbox flags, scaffold root, verdict with turns.
- `.gates/validate-evals.ts`: new gate.
- `plugins/qsm-builder/skills/skill-standards/SKILL.md`: how to write evals.
- `plugins/*/evals/`: every case rewritten into the three kinds, new `evals/` for qsm-memory.
- `plugins/*/skills/*/SKILL.md` and `plugins/*/agents/*.md`: the review decisions, the hand-on
  fixes, removals the person approves.
- Cost: one full pass is about 600 runs (estimate), spread over sessions by plugin task.

## Critiques

- Devil's advocate: 3/3 on 3 runs is a small sample, so a flaky judge can fail a good skill or
  pass a weak one. Fixed: a miss is re-run once before any rewrite, and graders have one to three
  points, so one nit cannot fail a run.
- Devil's advocate: "at most 1/3 without" can be met by a case that tests trivia only the skill
  text contains. Fixed: graders judge the decision a rule leads to, never a phrase from the skill.
- Devil's advocate: granting Bash lets an eval run real commands. Fixed: the OS sandbox confines
  writes to the workspace and denies the network, measured; scaffold scripts run as the person and
  are reviewed like code.
- Future archaeologist: in six months nobody knows why a case is shaped the way it is. Fixed: the
  rules live in skill-standards, the bar is a requirement in the root spec, and the miss reports
  live in the plugin tasks.
- Scope sniper: the review decisions and the hand-on fixes are not about the bar. Waived: the
  person asked for them in the same go, and the plugin task already rewrites those skills, so a
  second pass would touch the same files twice.
- Scope sniper: the validation gate adds code. Waived: without it, a new skill can ship with no
  scenario and the bar decays; it lands last so it never blocks the rewrite.
