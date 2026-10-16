# AGENTS.md — qsm-marketplace

A minimal, specialist Claude Code marketplace for one senior programmer and the agent working beside
them: straightforward instructions, hooks, and tools that let the agent see the world, verify its
output, and evaluate its work, so both meet the same expectations. The README's "Why it exists"
holds the whole of it. The repository root is the marketplace, and every capability is one plugin
under `plugins/<name>/` that carries its code, its CLI, its skills, its hooks, and its docs. Single
maintainer: we value each other's time and do not overcomplicate.

This file holds the ideas and the map. The detailed rules for building each kind of thing live in
the builder skills of `qsm-builder`, and the gates in `.gates/` check what a machine can check.

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

1. The core works alone.
2. A plug-in is independent of every other plug-in. A dependency is the exception, written in
   `plugin.json` and in the spec with its reason, and it has no fallback.
3. A plug-in reaches another only through its contract, a CLI verb or the noun, never its files.

## What we believe

- **The best code is the code not written.** Every new file, function or plugin claims something
  is missing; say the claim, or do not add it.
- **One shared thing, never a copy.** Search before adding and edit the owner in place, because
  two copies drift and a fix then lands in one of them.
- **Loud or working, never silent.** A state that cannot be used is `missing`, `failed`, `worse`
  or `blocked` with the cause named; a warning is only for a half-state that still works.
- **One logic, two doors; a hook is wiring.** Behaviour lives in a plugin's `lib/` behind a CLI
  verb. A person reaches it from a shell, a hook reaches the same verb as `$.<noun>.<verb>()`:
  `qsm-index reindex <path>` is `$.index.reindex({ path })`.
- **Evals over unit tests.** A change is proved by the least work that runs the real path end to
  end; a unit test only for logic the real run cannot reach. No test count goal.
- **Clean before and after.** A tool leaves the machine as it found it, plus what it was asked
  to add: an installer removes what older versions left, and a test leaves no temp dir.
- **No history in the tree.** When a decision changes, the old form is deleted everywhere. Git is
  the only history.
- **Public, so nothing machine-specific.** No employer names, tenant identifiers or machine paths.

## Iron Laws

Each law is the short form; the skill named after it holds the detail.

1. **A plugin owns its content**: skills, agents, code and docs live under the plugin (add-plugin).
2. **A plugin imports root `lib/` and itself only**; code two plugins need goes to `lib/` (add-lib).
3. **Docs: `README.md` always, opening with `## Why it exists` in at most five sentences;
   `INSTALL.md` and `USAGE.md` only with a bin; `openspec/` always; nothing else prose-shaped.**
   README is everything a consumer on GitHub needs, the spec says what the plugin does, and
   upstream behaviour gets a link (add-plugin). Which question each document answers is the table
   in `plugins/qsm-setup/instructions/CLAUDE.md` under "Where things live".
4. **A `SKILL.md` or agent file caps at 12 KB, aims for 8, and has no `references/`**; over the
   cap is two skills (add-skill).
5. **One canonical owner per concept**: search, edit in place, never a `v2` copy.
6. **No versioning, no history in the tree**: no deprecated markers, renamed-from notes, dates or
   changelogs, and no `version` in `plugin.json` (add-plugin).
7. **The plugin is the install unit**: `scripts/install.ts` is built on `lib/install-base.ts`
   (add-plugin).
8. **One plugin, one binary, named after the plugin**, its verbs described in `qsm.json`; help,
   completions and the noun read that one source (add-tool).
9. **A CLI is a compiled binary on the user's PATH** that reads arguments and `QSM_*` and
   `CLAUDE_*` variables only; nothing runs through a path into this repository (add-tool).
10. **No work- or machine-specific content**, because this repository is public.

## Where things live

```text
.claude-plugin/marketplace.json   # one entry per plugin, source ./plugins/<name>
lib/                              # layer 0: install-contract.ts, install-base.ts, cli-base.ts, outcome.ts, qsm-error.ts, qsm-manifest.ts, completions.ts, paths.ts, fs.ts, generate-noun.ts, mcp-stdio.ts, hooks-kit.ts, secret-shapes.ts, detach.ts, fixtures/ (sandbox, cli-fixture, cli, git, bin, plugin-fixture: tests only), nothing else
plugins/<name>/                   # layer 1: one plugin
  .claude-plugin/plugin.json      # name = directory name, author {"name": "qsm"}
  qsm.json                        # bin + command descriptions, only when the plugin ships a CLI
  package.json + bun.lock         # the plugin's own npm dependencies, only when it has any
  lib/ scripts/ skills/ agents/ commands/ hooks/ evals/ openspec/
  README.md                       # always; INSTALL.md + USAGE.md only with a bin
.gates/                           # the checks behind bun run validate, typecheck, test:hooks, eval
```

- Every agent needs it on every task: this file, one or two lines per entry.
- It is behaviour of one plugin: that plugin, with its spec in `openspec/specs/<name>/spec.md`.
- Two plugins need the same code: root `lib/`, only once the second copy exists.

## Which builder skill

Each skill of `qsm-builder` gives the steps, the hard rules with the gate that checks each one, and
what done means, ending in a `strict-reviewer` review.

| You are adding | Skill |
| --- | --- |
| a new plugin, or deciding where something goes | add-plugin |
| a CLI bin or a verb, its errors and its test | add-tool |
| a hook | add-hook |
| a skill, an agent or a command, and its evals | add-skill |
| code or a test fixture in root `lib/` | add-lib |
| the quality bar of any prompt | skill-standards |

## What the gates check

| Gate | Checks |
| --- | --- |
| `validate-plugin-contracts` | manifests, marketplace entries, skill, agent and command frontmatter, hooks.json, classic hook markers |
| `validate-file-size` | a skill or agent file under 12 KB, no `references/` |
| `validate-no-cross-plugin-import` | a plugin imports root `lib/` and itself only; `lib/` imports `lib/` only |
| `validate-generated` | the noun and types derived from `qsm.json`, the root README's generated block |
| `validate-why-it-exists` | every README opens with `## Why it exists`, five sentences at most |
| `validate-dependencies` | `plugin.json` dependencies match the spec's Dependencies requirement |
| `validate-npm-packages` | one exact pin per npm package, declared where imported, none in `lib/` |
| `validate-no-private-helpers` | no private copy of a root helper, HOME and XDG read only in `lib/paths.ts`, no `process.env` spread in a test |
| `validate-test-temp` | test code makes temp dirs through `sandboxDir` only |
| `typecheck-hooks` | every hooks module typechecks against the engine types |
| `test-hooks` | `claude plugin validate` and the hooks tests of every plugin |
| `plugin-eval` | `bun run eval <plugin>`: the skill and agent evals |

## Before a commit

```text
mise exec -- bun run validate
mise exec -- bun run lint
mise exec -- bun run typecheck
mise exec -- bun test ./ ./.gates
mise exec -- bun run test:hooks
```

- `bun test` skips a dot directory unless it is named, and skips `plugins/*/hooks/*.test.ts`;
  `test:hooks` runs those and skips visibly without `claude` on PATH.
- `bun run plugin-types` regenerates the engine types the hooks typecheck against.
- `bun run eval <plugin>` after a change to a skill or agent.
- One agent, one tree: an implementer works in its own worktree, and the orchestrator reviews,
  merges and deletes it, because the stop gate scores a whole tree.
- The langdev guard blocks `--no-verify`; a person lets a measured regression pass once with
  `QSM_LANGDEV_ALLOW="<why>"` before the command, which always asks.
