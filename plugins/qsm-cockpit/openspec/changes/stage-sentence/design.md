## Context

`GUIDE` in `lib/cockpit.ts` holds per stage `asks`, `done` and `next`, and `guideText` joins them
into the stage tool's answer. CLAUDE.md's loop table holds the same content a second time.

## Goals / Non-Goals

Goals: one sentence per stage that names what to do, the output, the tools and the skill.
Non-goals: pushing skill text, detecting whether a skill is loaded, a learn skill, the CLAUDE.md
table (a later piece).

## Decisions

- `GUIDE` gets per stage `does` (what to do ideally), `output`, `tools`, `skills` (empty for LEARN)
  and `next`; `guideText` writes them as one sentence:
  `You are in VERIFY: {does}; output {output}; tools: {tools}; load {skills} if not loaded;
  next LEARN, and call stage again when you move.`
  `asks` and `done` merge into `does` and `output`, so the content has one home.
- The cockpit owns the sentences, as the person decided; a skill is named by its full name
  (`qsm-openspec:spec-apply`). Naming is not a dependency: no import, no file read, and a plugin
  that is not installed costs the agent one failed Skill call. So `plugin.json` and the
  Dependencies requirement do not change.
- The reminder line on every prompt keeps reading `GUIDE[stage].next`.

## Risks / Trade-offs

- An agent skips the load: accepted, (b) waits for evidence from the person's live run.
- A renamed skill leaves a stale name in the sentence: the cockpit test asserts each named skill
  exists in the marketplace tree, so the rename fails the test.
