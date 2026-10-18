# qsm-worktrunk

Isolated, branch-named workspaces for parallel agent work, built on
[`wt` (worktrunk)](https://worktrunk.dev), for the person who runs several agents on one project.

## Why it exists

The harness's own worktree is a bare checkout: it carries only what git tracks, while a project
also runs on the env file, the local docs and the generated config that never enter the
repository. qsm-worktrunk replaces that default with `wt`, so a workspace an agent creates is a
full working copy, branch-named and sharing the main checkout's task store, and the agent can run
the project there without a human copying things across. It takes the stance that a workspace is a
place to work in, never just a place to diff. It refuses to be a branching strategy, a merge tool,
or a second git. When the harness creates worktrees that run out of the box, this plugin has no
reason to exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `worktrunk` | Holds the conventions for using `wt`, and how to change or repair its configuration |
| Command | `/qsm-worktrunk` | Reports whether `wt` is installed and new enough |
| Hook | `tool.call` on Bash | Refuses raw `git worktree` and names the `wt` command instead |
| Hook | `prompt.submit` | Tells the agent which workspace it runs in, and sets the working marker |
| Hook | `session.end` | Clears the working marker and names every local branch ahead of the working branch |
| Hook | `WorktreeCreate` | Creates the workspace through `wt` and points it at the main checkout's task store |
| Hook | `WorktreeRemove` | Removes the workspace through `wt` |
| Hook | `Notification` | Sets the activity marker |
| CLI | `qsm-worktrunk ahead` | Lists the local branches that hold commits the working branch lacks |

`wt` is not shipped here.

## Install

```bash
claude plugin install qsm-worktrunk@qsm-marketplace
bun plugins/qsm-worktrunk/scripts/install.ts
```

The install script compiles `qsm-worktrunk` and the three classic hooks, and links the binary. It
reports `wt` when it is missing. Install `wt` first (`sudo pacman -S worktrunk`,
`brew install worktrunk` or `cargo install worktrunk`), then run `wt config shell install` once and
open a new shell.

## Use

Ask: "work on this in an isolated workspace" or "start a branch for this in parallel". The harness
creates the workspace through `wt`. By hand:

```bash
wt switch --create <branch>
wt list
wt merge <branch>
wt remove <branch>
```

`/qsm-worktrunk` reports whether `wt` is installed and new enough. `qsm-worktrunk ahead` lists the
branches still to merge or delete; the session end toasts the same list.

## Caveats

- Without `wt` on PATH the hooks give up quietly. Only workspace create and remove fail loudly:
  `wt` missing, older than 0.22.0, or `switch` without `--create` and `--base`. The usual cause is
  an older `wt` earlier on PATH.
- The block misses a `git worktree` call built inside a command substitution or a script file.
- The task store is shared. A task closed in a workspace is closed everywhere, and it stays closed
  after the workspace is deleted.
- The branches-ahead list is literal: any local branch with a commit the working branch lacks,
  `main` included when the working branch is behind it.
- Removing a workspace deletes its branch and does not ask. `wt remove` keeps a branch with
  unmerged commits.
- `wt merge` squashes unless you pass `--no-squash`.
