## Why

The agent gets every stage's guidance at once in CLAUDE.md, and the stage tool answers only what
the step asks, when it is done and the next step. Epic qsm-xcwe decided guidance in doses: on each
stage switch the stage tool's answer is the one sentence that keeps the agent on course, what to do
ideally, what to output, which tools fit, and which skill to load if it is not loaded.

## What Changes

- The stage tool's answer becomes one sentence per stage: the step, what to do, what to output,
  the tools for the step, the skill to load when it is not loaded, and the next step.
- The tool pushes no skill text; the agent loads the skill itself (qsm-xcwe decision 1, option a).
- LEARN names no skill until one exists (qsm-xcwe decision 3; the learn skill is qsm-ga4c's).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qsm-cockpit`: the requirement "The agent says its step with the stage tool" changes what the
  answer holds.

## Impact

`plugins/qsm-cockpit/lib/cockpit.ts` (the GUIDE table and `guideText`), its tests, and the spec.
The prompt reminder line is unchanged. The "The loop" table in the qsm-setup instructions shrinks
in a later piece of qsm-xcwe, not here.

## Critiques

- Devil's advocate: an agent may skip "load the skill if it is not loaded" and work without it.
  Waived for now: the person chose (a) and keeps (b), a marker check, for when a live run shows the
  skip.
- Future archaeologist: the cockpit names skills of other plugins, which reads like a dependency.
  Fixed in design: a skill name is text the agent acts on, not an import, and a missing plugin
  costs one failed Skill call.
- Scope sniper: the minimum is new text in the GUIDE table and one function; no new event, no
  state, no config.
