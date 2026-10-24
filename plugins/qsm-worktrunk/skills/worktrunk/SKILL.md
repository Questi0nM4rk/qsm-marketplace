---
name: worktrunk
description: "Use when working with git worktrees or wt (worktrunk): creating, switching, merging or removing a branch workspace, configuring wt (project or personal config, workflow hooks around switch, commit and merge, commit-message generation, hook approvals), or a wt command that failed. Triggers: make a worktree for this branch, wt merge, wt remove, configure wt, .config/wt.toml, run tests before merge, install deps when a worktree is created, wt hook, wt switch does not cd, nastav wt, wt nefunguje."
---

# Worktrunk

Parallel work drifts when somebody tracks workspace paths by hand. `wt` gives every branch its own
workspace at a path it computes, and this skill serves the person who works that way: it holds
his conventions for using `wt`, and how to change or repair its configuration. A change ends in a
configuration edit or a diagnosis, never in an explanation alone. It does not list `wt`'s
commands: `wt --help` and worktrunk.dev are current, so read them instead of guessing a flag.

## Conventions

- One worktree per branch, named after the branch, under `.claude/worktrees/`. Use
  `wt switch -c <branch>` (add `--base <branch>` to start from another), `wt list`, `wt merge`,
  `wt remove`; never raw `git worktree`, because `wt` addresses a workspace by branch and a
  hand-made path drifts. The plugin blocks the raw call and names the `wt` replacement.
- After a squash merge, remove the branch with `wt remove <branch> -D`. The squash made a new
  commit, so the branch tip never fast-forwards to the target and `wt` reports it unmerged, while
  its content is already there.
- `wt merge` squashes by default, right for a one-commit branch. When a branch holds commits worth
  keeping apart, use `wt merge <target> --no-squash`.
- When `wt merge` printed `✓ Squashed` and then failed to push, fix the conflict on the target and
  run `wt step push`; running `wt merge` again squashes twice.

## Two configurations, two permissions

| | Project | Personal |
| --- | --- | --- |
| File | `<repo>/.config/wt.toml` | `~/.config/worktrunk/config.toml` |
| Holds | workflow hooks, dev server settings, anything the team shares | commit-message generation, path templates, defaults |
| Permission | edit it directly | propose the exact lines, write only after the person says yes |

The reason is recovery. The project file is versioned, so a wrong edit is one `git revert`. The
personal file is in no repository: a wrong edit is gone, and only the person can judge it.
"Run tests before merging" or "install deps for every new workspace" means the project file;
"generate my commit messages" or "put my workspaces elsewhere" means the personal one.

## Hooks: pick the timing first

| Hook | Runs | Blocks | For |
| --- | --- | --- | --- |
| `pre-start` | before a new workspace is finished | yes | dependency installs, checks that must pass first |
| `post-start` | after it exists, in the background | no | long builds, dev servers |
| `post-switch` | after moving into a workspace | no | terminal titles, editor notifications |
| `pre-commit` | before the commit in `wt merge` | yes | lint, typecheck, format check |
| `pre-merge` | before the merge into the target | yes | the test suite |
| `post-merge` | after a successful merge | no | deployment, notifications |
| `pre-remove` | before a workspace is deleted | yes | saving anything local |

A `pre-*` hook that exits non-zero stops the operation; a `post-*` hook only logs. A check that
must be enforced goes in a `pre-*` hook, because in a `post-*` one it silently does nothing. One
command per hook, or a named table that runs in order and stops at the first failure:

```toml
pre-start = "bun install"

[pre-commit]
lint = "bun run lint"
typecheck = "bun run typecheck"
```

Take the command from the project's `package.json`, `Cargo.toml` or `pyproject.toml` and check the
binary with `command -v`, because a hook naming a renamed script fails on the next merge, far
from here.

## Commit-message generation

Find the installed CLI (`command -v claude codex llm aichat`), then propose, for example:

```toml
[commit.generation]
command = "claude --print --output-format text --allowed-tools=''"
```

The empty `--allowed-tools` keeps it a one-shot prompt over a diff, because a model that can run
tools during a merge is a surprise nobody asked for. `wt step commit --show-prompt` shows what it
would send.

## Hook approvals are the person's

The first time a repository's `.config/wt.toml` runs a hook on a machine, `wt` asks the person to
approve the commands, and a session that cannot prompt prints `✗ Cannot prompt for approval in
non-interactive environment`. Stop there and tell him to run `wt config approvals add`. Do not
pass `--yes`, because the approval is his decision about running commands out of a repository
file; `--yes` belongs to pipelines whose configuration the pipeline controls.

## When something is wrong

| Symptom | Read this first |
| --- | --- |
| `wt switch` does not change the shell's directory | shell integration is missing: `wt config shell install` once, then a new shell |
| a hook never runs | wrong timing (a `post-*` hook cannot block) or it was never approved |
| the activity marker is stale in `wt list` | `wt config state marker set active`, `wt list`, `wt config state marker clear` |
| the harness reports `WorktreeCreate hook failed` | the `wt` on the harness's PATH is missing, older than 0.22.0, or its `switch` lacks `--create` and `--base`; the message carries wt's last line, `/qsm-worktrunk` reports the version |

## Red flags

- When you are about to write the personal config unasked, write a proposal instead, because it
  has no `git revert`.
- When an approval prompt blocks a hook, stop and hand it to the person, because `--yes` decides
  for him.
- When a check must pass and you are putting it in a `post-*` hook, move it to `pre-*`, because
  `post-*` cannot block.
- When `wt merge` failed on the push, fix and `wt step push`, because a second merge squashes
  again.
- When you are about to `wt remove` the workspace the shell stands in, `cd` out in a call of its
  own first, because a removed session directory fails every hook spawn and the secrets mask then
  withholds the whole chat.

## Say it in the reply

Name the file you changed and why that file, in one line. When you added a hook, say its timing
and what fails if it fails. When nothing was written because the person must approve something,
say which command he runs.
