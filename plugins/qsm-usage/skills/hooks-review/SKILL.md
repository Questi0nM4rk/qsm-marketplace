---
name: hooks-review
description: "Use when Claude Code feels slow between steps or hooks may be noisy: slow hooks, which hook blocks, hook timing, a hook times out, why does every tool call lag, what do my hooks inject, hook output nobody reads. Finds hooks that are slow, time out, or inject text no later turn uses, from the transcripts and the ledger."
---

# Hooks review

A hook on a per-call event blocks the loop every time it fires, and a hook that injects text
charges that text to every later turn. This skill finds both and proposes one fix per hook. It
edits no hook configuration the person did not confirm. Shared reading and apply rules are in the
`usage` skill.

## Where the data is

The ledger does not time classic hooks. Read duration from the transcripts of the window:
attachment entries of type `hook_success`, `hook_non_blocking_error`,
`hook_error_during_execution` or `hook_cancelled`, with `hookName`, `hookEvent` and `durationMs`.
A silent successful run is not written, so a hook with no entries has "no timing data".
`mcp__qsm-usage__ledger` holds every injected piece of text per session with its source and size.

## Slow and timing out

Per hook and event, the typical run and the worst. Warn above 2 s typical on `PreToolUse`,
`PostToolUse` and `UserPromptSubmit`, above 10 s on `SessionStart` and `Stop`. A run cancelled by
its timeout ran until the timeout, so its duration is a floor and a hook that keeps timing out is
the worst case; an Esc cancel says nothing about speed. For a slow hook read its `command` with a
key-scoped read and point at the heavy part (network call, package manager, cold interpreter).
Run a hook command yourself only when it is plainly read-only and the person agrees, with a timeout.

## Injected text no later turn uses

From the ledger, injection sources that recur on most turns, with their size per turn: 800 tokens
on each of 40 turns is 32,000 per session. Whether a later turn uses the text is a judgement: read
one recent session's injected text and its next few assistant turns, and look for its file names,
terms or numbers. Say it is a judgement from one sample, and name the session.

## Findings

One fix per hook, the one with the largest effect: make it async, cache its output, narrow its
matcher, inject only on change, shorten its output, or remove it. An injection saves its size times
the turns it fires on. A slow hook saves no tokens: `savingTokens` 0 and a `savingNote` with the
time ("~3 s on each of ~120 tool calls per session"). A fix is `change.kind: "edit"` with the
settings or hook file as `target`, `verdict: "fix"`, `question: "cleanup"`. When no fix is safe:
`verdict: "warn"`, `change.kind: "none"`, `question: "none"`.

## Red flags

- When a hook has no timing entries, say "no timing data" and do not guess, because silence is not
  speed.
- When a duration comes from a cancelled run, report it as a floor, because the real run was
  longer.

## Say it in the reply

One line per hook: name, event, typical and worst duration or tokens injected, the one fix.
