# AGENTS.md — qsm-marketplace

A minimal, specialist Claude Code marketplace for one senior programmer and the agent working beside
them: straightforward instructions, hooks, and tools that let the agent see the world, verify its
output, and evaluate its work, so both meet the same expectations. The README's "Why it exists"
holds the whole of it. The repository root is the marketplace, and every capability is one plugin
under `plugins/<name>/` that carries its code, its CLI, its skills, its hooks, and its docs. Simple
and straightforward: we value each other's time and do not overcomplicate. Single maintainer.

## Layout

```text
.claude-plugin/marketplace.json   # one entry per plugin, source ./plugins/<name>
lib/                              # layer 0, imports no third-party package (a plugin's packages are in its own package.json, installed by its installer): install-contract.ts, install-base.ts, cli-base.ts, outcome.ts, qsm-manifest.ts, completions.ts, paths.ts, generate-noun.ts, mcp-stdio.ts, hooks-kit.ts, secret-shapes.ts, detach.ts, fixtures/sandbox.ts (tests), nothing else
plugins/<name>/                   # layer 1: one plugin
  .claude-plugin/plugin.json      # name = directory name, author {"name": "qsm"}
  qsm.json                        # bin + command descriptions, only when the plugin ships a CLI
  package.json + bun.lock         # the plugin's own npm dependencies, only when it has any; the install base runs `bun install --frozen-lockfile` before it compiles
  lib/ scripts/ skills/ agents/ commands/ hooks/ openspec/
  README.md                       # always, opens with `## Why it exists`; INSTALL.md + USAGE.md only with a bin
.gates/                           # bun run validate
```

## Architecture: a microkernel with ports

The marketplace is a microkernel, also called a plug-in architecture (Richards and Ford,
Fundamentals of Software Architecture): a small core that works alone, and plug-ins that add a
capability or replace a default with a better one. Want better web research than the harness's
own search: install qsm-web. The contract between them is a port, a role such as "task" or
"spec", served by whichever plug-in is installed, so one tool can be swapped for another without
touching its users (Cockburn, ports and adapters).

| Part | What it is here |
| --- | --- |
| core | the harness's own tools, qsm-essentials and root `lib/`; it never names a plug-in |
| plug-in | every other plugin: it adds a capability or replaces a default, and says which |
| registry | `.claude-plugin/marketplace.json`, installed by qsm-setup |
| contract | a plugin's CLI verbs in `qsm.json` and the noun generated from them (`$.<noun>`) |

1. The core works alone. A plug-in that replaces a default says in its README's "Why it exists"
   which default and why it is better.
2. A plug-in is independent of every other plug-in. A dependency is the exception, and it is
   written twice: the name in `dependencies` of `.claude-plugin/plugin.json`, which Claude Code
   installs, and a `Dependencies` requirement in the plugin's spec with one reason per name and a
   scenario for what fails without it. A dependency has no fallback: without it the plugin fails
   with `missing` and names what to install.
3. A plug-in reaches another only through its contract, a CLI verb or the noun, never through its
   files (Iron Law 2 for code, Iron Law 9 for paths).

## Iron Laws (proposed in the rewrite, the user reviews here)

1. **A plugin owns its content.** Skill bodies, agent bodies, code, and docs live under the plugin.
2. **A plugin imports from root `lib/` and from itself only, never from another plugin.** Shared
   code that two plugins need goes to `lib/`. Enforced by `validate-no-cross-plugin-import`.
3. **Docs: `README.md` always, `INSTALL.md` + `USAGE.md` only with a bin, `openspec/` always,
   nothing else prose-shaped.** Two questions, two files, no overlap: the spec says what the
   plugin does, README holds everything a consumer on GitHub needs in one self-contained page:
   why it exists, what it is, install, use, caveats. README may repeat the spec and USAGE; a
   consumer never opens those. Our surface only: our verbs, our
   wiring, our caveats. Upstream behaviour gets a link, never a transcription.
   - **`## Why it exists` is the first `##` section of every README (the root's too), and it is at
     most five sentences.** Abstract and holistic: the gap in the world without it, the stance it
     takes, what it refuses to be, and the sentence that says when it would have no reason to
     exist. No features, no verbs, no install, no file names. It changes only when the reason
     changes, and then it is rewritten whole. Enforced by `validate-why-it-exists`. "Intent" means
     only the intent of a piece of work, in its tracker epic.
   - Which question each document answers, task tool and memory included, is the table in
     `plugins/qsm-setup/instructions/CLAUDE.md` under "Where things live".
4. **`SKILL.md` and agent files cap at 12 KB, aim for 8, and there is no `references/`.** Over
   the cap means two subjects: split into two skills. Expert depth that would be a reference is
   its own skill or nothing. Enforced by `validate-file-size`.
5. **One canonical owner per concept.** Search before adding; edit in place; never `v2` copies.
6. **No versioning, no history in the tree.** When a decision changes, the old form is deleted
   everywhere it appears: no deprecated markers, no renamed-from notes, no dates, no changelogs,
   no "previously". Git is the only history. A `plugin.json` carries no `version`: Claude Code
   then names the plugin's cache after the commit, so `claude plugin update` picks up each new
   commit; a pinned version keeps the old copy forever. Enforced by `validate-plugin-contracts`.
7. **The plugin is the install unit.** `scripts/install.ts` exports `install(ctx)` from
   `lib/install-contract.ts`; a plugin that needs another names it in the `dependencies` array of
   its `.claude-plugin/plugin.json`, with its reason in the spec (Architecture, rule 2), and never
   shells out to a sibling installer. That field is Claude Code's own: `claude plugin install`
   resolves it and reports `+ 1 dependency: <name>`.
8. **One plugin, one binary, named after the plugin; its descriptions live in `qsm.json` under
   `qsm.commands`.** A verb may be several words (`qsm-usage toon encode`), and the generated
   noun joins them into one method (`$.usage.toonEncode`). Help, completions, and the noun read
   one source.
9. **A CLI is a compiled binary on the user's PATH, and reads arguments and `QSM_*` environment
   variables only.** Nothing is invoked through a path into this repository, not by a hook, not
   by a skill, not by an agent; install compiles every bin and hook and links the bins into the
   user's bin directory, and everything a binary needs at run time is inside it. That is what
   makes a tool runnable from a test or a shell with no harness and no checkout in the room.
10. **No work- or machine-specific content.** Employer names, tenant identifiers, machine paths stay
    in the machine-local marketplace. This repository is public.

## Where does X go?

1. Every agent needs it on every task: this file, one or two lines per entry.
2. It is behaviour of one plugin: that plugin, with its spec in `openspec/specs/<name>/spec.md`.
3. Two plugins need the same code: root `lib/`, and only after the second consumer exists.

## Operational notes

- **One agent, one tree.** An implementer works in its own temporary worktree; the orchestrator
  reviews, merges it into its own branch, and deletes it. Two agents never edit one tree: the stop
  gate scores a tree, and a shared tree blocks the wrong agent.
- **One logic, two doors; a hook is wiring.** A plugin's behaviour lives in its `lib/`, tested
  there, and is reached through its CLI verbs (`qsm.json`), which the generated noun also exposes
  to hooks as `$.<noun>.<verb>()`: `qsm-index reindex <path>` in a shell is
  `$.index.reindex({ path })` in a hook. A hook is a function hook in `hooks/register.tsx` that
  calls its own noun and holds no logic, because a hooks module runs in the engine's sandbox (no
  Node, no `node:fs`, no sqlite) and imports nothing outside its plugin's folder, root `lib/`
  included. It never listens on `classic.*`, `prompt.section`, `prompt.context` or
  `prompt.compose`: under managed settings (a Team org's remote settings count) the engine's
  `cc-plugin-sec-default` skips a user-tier plugin there. Hidden context for the model goes on
  `prompt.submit` as `context`; the calling agent's cwd is `$.session.cwd()`.
  Work that outlasts the hook (the engine cuts the session-end chain at 1.5 s) is a verb that starts
  its own detached child and returns at once, as `qsm-index reindex` does; a hook never runs `sh`.
  A classic command hook (`hooks/hooks.json` under `hooks`, a binary in `dist/`) exists only for an
  event with no function form, and its source opens with `// classic: <event> has no function
  event`; `bun run validate` lists them and fails on one without it. Four exist: langdev's
  SubagentStop gate and worktrunk's worktree create, worktree remove and notification marker. A
  `WorktreeCreate` hook prints the bare path. Raw bash is bootstrap glue only.
- **Loud or working, never silent.** A state that cannot be used is `missing`, `failed`, `worse`
  or `blocked` with the cause named; a warning is only for a half-state that still works. Spec:
  the outcome system requirement.
- **Evals over unit tests.** A change is proved by the least work that runs the real path end to
  end; a unit test only for logic an eval cannot reach. A skill's or agent's eval is
  `bun run eval <plugin>` (`evals/` in the plugin). Single user, personal tools: no test count goal.
- **Every seam proves itself, or the gate fails loud** (spec: hooks prove seams and behaviour, fail
  loud). One reader per seam in `hooks/`: `bun test` feeds binary output, `claude plugin test` feeds
  shapes; a stub alone is never proof. A `.catch` toasts `<plugin> ERROR: <event>: <reason>`, logs,
  keeps its open/closed policy. A classic command hook's `bun test` spawns it on stdin.
- **Types are shipped, never guessed.** `bun run plugin-types` regenerates `.claude/types/`
  (gitignored); every hooks module typechecks against it through its `hooks/tsconfig.json`, run by
  `bun run typecheck`. An IDE showing `Cannot find module 'claude-code'` on `hooks/register.tsx` is
  using the wrong project; the gate is the verdict. A plugin that adds a noun commits its contract,
  `types/index.d.ts`, generated by `lib/generate-noun.ts` and named in plugin.json as `types`. A
  hooks module never shells out to a sibling's bin by path.
- **A tool cleans before and after itself.** An installer purges every older version's artifact
  (link, PATH block, data dir, backup) before it writes and names each removal; a second run
  removes nothing. Anything that creates a temp directory writes the full cleanup; a `finally` is
  not it. Spec: `qsm-setup`, install purge.
- `bun run validate`, `bun run lint`, `bun run typecheck`, `bun test` before a commit. `bun test`
  skips `plugins/*/hooks/*.test.ts` (they import `claude-code/testing`); `bun run test:hooks` runs
  those and `claude plugin validate` over every plugin, and skips visibly without `claude` on PATH.
- The langdev guard blocks `--no-verify`; a person lets a measured regression pass once with
  `QSM_LANGDEV_ALLOW="<why>"` before the command, which always asks.
