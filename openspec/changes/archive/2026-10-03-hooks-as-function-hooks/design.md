## Context

Classic hooks today (event, plugin, binary): `PreToolUse` Bash guards in `qsm-forge`, `qsm-langdev`,
`qsm-secrets`, `qsm-worktrunk` (`git-worktree-guard`), `qsm-usage` (`bash-filter`); `PostToolUse` in
`qsm-index` (commit, edit), `qsm-langdev` (edit), `qsm-usage` (toon); `SessionStart` in `qsm-index`
and `qsm-memory`; `SessionEnd` in `qsm-memory`; `SubagentStop` in `qsm-langdev`;
`UserPromptSubmit`, `Notification`, `WorktreeCreate` and `WorktreeRemove` in `qsm-worktrunk`.
Function hooks already exist in all 25 plugins' `register.tsx` for the rest. The engine's
declarations (`.claude/types/claude-code.d.ts`) name `session.start`, `session.end`, `tool.call`,
`prompt.submit`, `process.spawn` and others; a hook blocks with `{ deny }` (qsm-builder does).

## Goals / Non-Goals

Goals: one hook model; a measured, written reason for every classic hook that stays; no loss of
what a guard blocks today.

Non-Goals: changing any guard's rules; fixing the engine; supporting a Claude Code older than the
installed one.

## Decisions

1. **Measure once, by hand.** A probe hooks module logs, in the main agent and in a subagent of
   the same session: `$.session.cwd()`, `agentId`, whether the wrapped Bash call fails, and a
   module-level counter. Its source is under "Probe sources". It is not a gate test: every session
   runs 2.1.288 or later, and `claude-code/testing` cannot start a real subagent, so a kept test
   would pay a live model call to re-prove a fixed engine.
2. **A function hook denies with `{ deny: reason }`** on `tool.call`; the rule text each guard
   returns is unchanged (a deny reason is a command to use instead).
3. **No state layer.** The measurement below shows a module variable is shared between the main
   agent and a subagent, so a hook keeps its state in the module. If a later release breaks that,
   the fallback is one file per session under `XDG_RUNTIME_DIR`, reached through the plugin's own
   CLI noun (a hooks module may not import outside its plugin or shell out to a sibling's bin).
4. **A migrated hook calls its own noun.** The hooks module cannot import `lib/` (no Node in the
   engine's sandbox), so the logic of a classic hook stays in `lib/`, reached through a CLI verb,
   and the hook calls that verb as `$.<noun>.<verb>()`. A rule no verb has yet becomes a verb or a
   flag. Behaviour stays one to one: the qsm-index commit and edit triggers check that an index
   exists and was not declined, then call `reindex`, as today.
5. **Never `classic.*` or `prompt.section|context|compose`.** A Team org's remote managed settings
   seat `cc-plugin-sec-default`, which skips a user-tier plugin's handlers on those events (debug
   log: `classic.SessionStart bypassed by cc-plugin-sec-default (tier user)`). Context for the
   model goes on `prompt.submit` as `context` (verified live: the model read it); a tool call's cwd
   is `$.session.cwd()`; session end saves by catch-up, which needs no `transcript_path`.
6. **Slow work detaches inside the verb.** The session-end chain is cut at 1.5 s; a verb that can
   take longer (`qsm-memory save`) starts a detached child and returns, as `qsm-index reindex` does.
7. **Classic is the exception.** A classic hook carries a comment `classic: <event> has no function
   event`; `.gates/` lists them and fails on one without it.

## Release notes read, Claude Code 2.1.280 to 2.1.288

Source: the `anthropics/claude-code` CHANGELOG, read 2026-10-03. Only what bears on this change.

| Version | Entry | Bears on |
| --- | --- | --- |
| 2.1.288 | A plugin's `tool.call` hook no longer makes Bash fail and file searches read the wrong folder in subagents that run in a worktree | the third reason for a classic Bash guard; the measurement below must confirm it |
| 2.1.288 | `claude plugin test` no longer reports mods as turned off from a stale saved setting | `bun run test:hooks` runs hooks modules (task qsm-i1u.10, closed) |
| 2.1.288 | `PreToolUse` and `PermissionRequest` hooks that cannot match or serialize their input now block the call | a guard fails closed |
| 2.1.288 | `InstructionsLoaded` hook carries `agent_id` and `agent_type` | the identity of a subagent reaches hooks |
| 2.1.287 | Plugin listings name dependencies that were not installed; `update` retries an unfinished install | install of the seven migrated plugins |
| 2.1.285 | `claude plugin configure <plugin>` saves options from stdin (`--values-stdin`) | the backend choice of `qsm-secrets` |
| 2.1.285 | A synchronous hook that starts a background process holding its output no longer hangs Claude Code | detached builds started from a hook |
| 2.1.286, 2.1.285 | Logs and transcripts redact a secret whose key name hides a zero-width character, and a URL password containing `@` | the engine's own redaction, not a substitute for the capture hook |
| 2.1.281 | A plugin's hook failure names the plugin; `claude plugin validate` warns on an unquoted `${CLAUDE_PLUGIN_ROOT}` | loud failures |

Nothing in the notes says that `prompt.submit` may rewrite a prompt or that `tool.call` may rewrite
a result; the declarations say the first (`next({ ...e, text })`) and the second is measured by the
secrets change.

## Measurement

Run 2026-10-03 on Claude Code 2.1.288, a `tool.call` hook on Bash written as a session mod, the
main agent and one subagent started with `isolation: worktree`, seven Bash calls in all.

| Observation | Main agent | Subagent in a worktree |
| --- | --- | --- |
| `agentId` in the hook's `e` | absent | the subagent's id |
| `$.session.cwd()` in the hook | the main worktree | the subagent's own worktree |
| the wrapped Bash call | succeeds | succeeds; `pwd` and `git rev-parse --show-toplevel` print its worktree |
| a module-level counter | 1, 2, 6, 7 | 3, 4, 5 (one instance, shared) |
| `$.fs.write` from the hook | works | works |

What a hook may rewrite, run the same day with a second mod:

| Rewrite | Result |
| --- | --- |
| a Bash command (`e.command` through `next({ ...e, command })`) | works: `echo hello-from-hook` printed `hello-from-hook` |
| a Bash result (`{ ...ran, result: { ...ran.result, stdout } }`) | works: a value the command printed reached the model as `{{secret:probe}}`; the transcript on disk holds the mask, not the value |
| a prompt (`prompt.submit`, `next({ ...e, text })`) | not run live; the declarations allow it |

Consequences: the third reason for a classic Bash guard no longer holds on this version, the temp
state layer is not needed, and the secrets change may rewrite a command and a result.

## Probe sources

The session mod that produced the first table (`tool.call` on Bash; rerun it by hand if a release
note touches hooks in subagents):

```ts
let calls = 0
export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    calls += 1
    const sessionCwd = await $.session.cwd()
    const ran = await next(e)
    const isError = ran.deny === undefined ? ran.isError === true : 'denied'
    await $.fs.write(`/tmp/probe/${Date.now()}-${calls}.json`, JSON.stringify({
      n: calls, agentId: e.agentId ?? null, sessionCwd, command: e.command.slice(0, 120), isError,
    }))
    return ran
  })
}
```

The rewrite probe (`tool.call` rewrites the command and masks the result; `prompt.submit` rewrites
the text):

```ts
export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = e.command.replaceAll('hello-from-hook', 'hello-from-hook')
    const ran = await next(command === e.command ? e : { ...e, command })
    if (ran.deny !== undefined || ran.result === undefined) return ran
    const stdout = ran.result.stdout
    return stdout.includes('PROBE-SECRET-12345')
      ? { ...ran, result: { ...ran.result, stdout: stdout.replaceAll('PROBE-SECRET-12345', '{{secret:probe}}') } }
      : ran
  })
  on('prompt.submit', ($, e, next) => next({ ...e, text: e.text.replaceAll('PROBE-PROMPT-777', '{{secret:prompt}}') }))
}
```

A mod is three files under `~/.claude/dev-mods/<session id>/<name>/` (`.claude-plugin/plugin.json`,
`hooks/hooks.json` naming `./register.tsx`, `hooks/register.tsx`), loaded after the person answers
the hot-reload question; `claude plugin validate <folder>` checks it.

## Possible improvements

- Binaries: 18 compiled hook binaries are 1.5 GB in the tree and 1.6 GB in the plugin cache; the
  migration removes both and the `bun build --compile` step of seven installers.
- `claude plugin configure <plugin> --values-stdin` (2.1.285) may replace a setup file of our own
  for per-plugin choices.
- The `InstructionsLoaded` hook carries `agent_id` and `agent_type` (2.1.288); a hook that wants the
  subagent's identity has a second source.

## Risks / Trade-offs

- [Measured on one version] → accepted: the fix is in 2.1.288 and no session runs older; a release
  note that touches subagent hooks is the trigger to rerun the probe by hand.
- [A hook that throws now throws inside the engine] → the `.catch` toast and policy stay mandatory.
- [Seven plugins touched] → one task per plugin, each green on its own.

## Open Questions

- Does the engine have a function event for `WorktreeCreate`, `WorktreeRemove` and `Notification`?
  Task 3 answers it from the declarations before any rewrite.
- Does the guard in `qsm-langdev` still behave under a worktree whose repository is not the
  session's? `$.session.cwd()` gives the subagent's worktree; task 4 proves it with a real commit.

## Spec sync

Root `openspec/specs/qsm-marketplace/spec.md`: append the ADDED requirement after "Every hooks
module proves its seams and its behaviour, and fails loud". The `AGENTS.md` note "Hooks are
function hooks first" is rewritten to the new rule. Archive with `openspec archive
hooks-as-function-hooks --skip-specs` after the sync, as for the previous changes.
