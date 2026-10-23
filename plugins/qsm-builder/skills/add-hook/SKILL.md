---
name: add-hook
description: "Use when adding a hook to a plugin of this marketplace: a function hook in hooks/register.tsx that reacts to a harness event, or a classic command hook for an event with no function form. Triggers: add a hook, new hook, hook on tool.call, hook on session start, block a command with a hook, inject context on every prompt, pridej hook, udelej hook, hook na prompt. The verb a hook calls is add-tool, a new plugin is add-plugin, a skill is add-skill."
---

# Add Hook

A hook is wiring: it picks an event and calls one verb of its own plugin. The logic lives in the
plugin's `lib/` behind a CLI verb, because a hooks module runs in the engine's sandbox (no Node, no
`node:fs`, no sqlite) and a shell or a test must reach the same behaviour without the harness. This
skill keeps a hook from growing logic, failing silently, or listening where the engine skips it. It
does not decide whether the capability should exist (add-plugin does).

## Steps

1. Find the home: the plugin that owns the behaviour (add-plugin step 1), never a new plugin.
2. Write the behaviour as a verb with add-tool: `lib/` function, `qsm.json` entry, spec
   requirement and scenario first, then the regenerated noun.
3. Pick the event from `.claude/types/claude-code.d.ts` (`bun run plugin-types` makes it), in the
   function form; the classic form only when that file has no event for it.
4. In `hooks/register.tsx` call `registerNoun(on)`, then `on(<event>, ...)` calling
   `$.<noun>.<verb>({...})`, then `.catch` calling `failure($, <event>, next.error)` before the
   plugin's own policy: open (`return next(e)`) or closed (`return { deny: reason }`).
5. Make `hooks/tsconfig.json` and `hooks/register.test.ts` by copying `plugins/qsm-index/hooks/`.
   A `plugin.json` that names hooks gives a `.json` path, never `"hooks": null`, which the
   manifest check refuses.
6. Run Done means, then hand the diff to the review.

## Hard rules

1. A hook only calls its own `$.<noun>.<verb>()` and decides nothing, because a shell and a test
   reach a verb and never a hook. Gate: review.
2. A hooks module imports only `claude-code` and files in its own plugin folder, never root
   `lib/`, because the sandbox cannot resolve it; a sandbox file may hold its own copy of a root
   helper, and `validate-no-private-helpers` skips it. Gate: `bun run typecheck`, the engine load.
3. Every `.catch` calls the generated `failure($, event, next.error)`, which toasts
   `<plugin> ERROR: <event>: <reason>` and logs, before its own policy, because a dead hook is
   never silent. Gate: review.
4. A hook never listens on `classic.*`, `prompt.section`, `prompt.context` or `prompt.compose`,
   because under managed settings (a Team org's remote settings count) the engine skips a
   user-tier plugin there. Gate: review.
5. Hidden context goes on `prompt.submit` as `context`, and the calling agent's cwd is
   `$.session.cwd()`, because those are the forms the engine keeps. Gate: review.
6. Work that outlasts the hook is a verb that starts a detached child with `spawnDetached` from
   root `lib/detach.ts` and returns at once, and a hook never runs `sh`, because the engine cuts
   the session-end chain at 1.5 s. Gate: review.
7. A classic command hook (`hooks/hooks.json`, a binary in `dist/`) exists only for an event with
   no function form, and its source opens with `// classic: <event> has no function event`,
   because every other event has a typed, sandboxed form. Gate: `validate-plugin-contracts`, and
   `bun run validate` lists every classic hook.
8. A classic hook uses `readHookEvent` and `runMain` from root `lib/hooks-kit.ts`, its `bun test`
   spawns the binary on stdin, and a `WorktreeCreate` hook prints the bare path, because it must
   never crash or block the caller. Gate: review.
9. `hooks/tsconfig.json` extends the root `tsconfig.hooks.json` and lists only files that exist,
   because the module is typechecked against the shipped engine types. Gate: `bun run typecheck`.
10. `hooks/register.test.ts` covers each event and each `.catch` through `claude plugin test`,
    because a stub alone never proves a seam. Gate: `bun run test:hooks`.
11. A hook that reads a Bash command reads the command behind its wrappers: a pattern anywhere
    in the line, or shell-ast's unwrap with a resolver, because qsm-usage rewrites `git worktree
    lock /x` to `rtk git worktree lock /x` before later hooks see it, and a guard that reads the
    first word lets it pass. Gate: a test case with the `rtk` prefix.
12. A `$.process.run` of a bin that reads only stdin passes `cwd: "/"`, because the session's
    directory can be removed under it (a worktree), and every spawn there fails with
    `ENOENT: posix_spawn '<bin>'`, the same text a missing binary gives. Gate: review.
13. A `tool.check` allow never lifts a managed deny rule (`~/.claude/remote-settings.json`), so a
    permission hook starts from the effective deny rules, because the engine keeps the deny and
    only reports it. Gate: a live run in a fresh session.

## Done means

Run as `mise exec -- ...`, all passing:

- `bun run validate`, `bun run lint`, `bun run typecheck`
- `bun test ./ ./.gates`
- `bun run test:hooks`, which must not skip: `claude` is on PATH
- a real run of the verb the hook calls, in a shell, with its output read
- the hook firing in a fresh session (`claude -p --model haiku "<the call>"`), because a running
  session keeps the module it loaded; a `-p` session has no scratchpad, so a scratchpad case
  needs an interactive one

Then hand the diff to the `qsm-review` strict-reviewer agent with the Hard rules as its checklist;
the build is done when every command passes and the review returns no blocker.

## Red flags

- A hook body with an `if` that is not matching an event: move it to the verb.
- A `.catch` that only returns `next(e)`: add `failure(...)` first.
- A hook that needs `node:fs`, `Bun.spawn` or a root `lib/` import: the work is a verb.
- An IDE shows `Cannot find module 'claude-code'` on `register.tsx`: it uses the wrong project;
  `bun run typecheck` is the verdict.

## Say it in the reply

The event, the verb it calls, the failure policy (open or closed) and why, and the output of
`bun run test:hooks`.
