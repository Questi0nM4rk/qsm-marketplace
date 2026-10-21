# Git rule

Read this when you commit, push, open a pull request, or answer a review. The commit message form
is the writing skill; worktrees are the worktrunk skill; threads are the review-threads skill.

1. The main agent pushes the working branch when a task or a batch finishes, so local commits
   never pile up. A worker never pushes.
2. On main, run `git pull --rebase=merges` before `git push`, because long sessions and parallel
   agents leave the remote ahead, and a rejected push costs a manual merge. A plain `--rebase`
   flattens a worker's merge commit and replays its conflicts.
3. A phase pull request targets the feature branch. Only the final consolidated one targets main.
4. After a squash merge, a stacked pull request is not rebased: the rebase replays commits that
   already landed under another SHA and conflicts on each. Reset to `origin/main`, cherry-pick
   only the new commits, and push with `--force-with-lease`.
5. A release tag is annotated (`git tag -a vX.Y.Z -m "..."`), because `--follow-tags` pushes only
   annotated tags and skips a lightweight one without a word.
6. Fix every review finding that holds, nitpicks included, before you push, because a second
   round trip costs more than a one-line fix. Run `/simplify` before every push and read what it
   removed, because it can drop code that handles an edge case it did not recognise.
7. A `gh` command is one line, with no backslash continuation, because permission matching reads
   one line. Ask for `--json` when the output is read by a program. A body with backticks goes in
   `--body-file` or `--notes-file`, because the shell runs backticks as a command and the comment
   posts mangled. Read fresh comments with `gh api repos/<owner>/<repo>/issues/<n>/comments`,
   because `gh issue list --json comments` lags behind.
8. Work lands in this order, with no pull request until the person says otherwise: a worktree, a
   local test, a local review agent, `/simplify`, then a merge to main. A step skipped is named,
   never silent.
