## Why

The marketplace has two hook models. Function hooks (`hooks/register.tsx`) are the standard; seven
plugins still ship classic command hooks, compiled to `dist/`, for three reasons written in
`AGENTS.md`: an event the engine had no function event for, the engine's sec-default module
skipping a user-tier module's `classic.*` handlers under managed settings, and a Bash guard that
must keep a subagent's worktree, because a user-tier `tool.call` handler's worker hop lost it.
Claude Code 2.1.288 fixed it, and the measurement in `design.md` confirms it: a function hook in a
subagent that runs in a worktree sees that worktree and its own `agentId`, a Bash call it wraps
does not fail, and a module variable is shared between the main agent and the subagent. Two models
cost every reader twice (two test styles, two build paths, two places a bug hides), and the classic
one costs disk: 18 compiled hook binaries are 1.5 GB in the tree and the same again in the Claude
Code plugin cache.

This change makes every hook a function hook and keeps a classic hook only where the engine has no
function event for it.

## What Changes

- Migrate every classic hook to a function hook, one plugin per task: `qsm-index`, `qsm-memory`,
  `qsm-forge`, `qsm-secrets`, `qsm-worktrunk`, `qsm-langdev`, `qsm-usage`.
- Keep a classic hook only for an event the engine has no function event for (the worktree create
  and remove hooks are the known candidates); each says so, with the event, in a comment.
- Delete the classic build path (`dist/` hooks, their `hooks.json` entries) from every plugin that
  no longer has one; the 1.5 GB of binaries go with it.

Not in this change: new hooks, changing what any guard blocks, the secrets design (its own change,
`secrets-backends-and-session-guard`), and a fix for the engine's worker hop itself.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qsm-marketplace`: one requirement states that every hook is a function hook, with the classic
  hook as a measured exception.

## Impact

- `plugins/*/hooks/` (register.tsx added, binaries and `hooks.json` entries removed), `AGENTS.md`
  (the "Hooks are function hooks first" note), `.gates/` (the gate that lists classic hooks).
- Installed users restart Claude Code once and reinstall the seven plugins.

## Critiques

Devil's advocate:

- The measurement passes today and may fail on the next engine release. Waived: the fix shipped in
  2.1.288, no session runs older, and a kept test would need a live model call on every gate run.
  The probe sources stay in `design.md` for a rerun by hand.
- A function hook runs in the engine's process; a crash there is the whole session, not one
  hook's exit code. Fixed: every migrated hook keeps the `.catch` toast and open/closed policy the
  root spec already requires.

Future archaeologist:

- Why is a classic hook still here? Fixed: the exception rule requires a comment naming the event
  that has no function form, and the gate prints the list.
- Why is there no state layer when the earlier design had one? Fixed: the measurement showed the
  module variable is shared between agents; the design records it.

Scope sniper:

- Seven plugins in one change is too wide. Waived: the tasks are one plugin each and ship
  independently; the change is one decision (one model), not one diff.
- The state layer was speculative. Fixed: removed after the measurement showed no loss.
