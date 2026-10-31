# Git rule

Read this when you commit, merge, push, or answer a review. The commit message form
is the writing skill; worktrees are the worktrunk skill; threads are the review-threads skill.

1. Every session works in its own worktree under the project's `.claude/worktrees/`, made through
   wt (`EnterWorktree`), never in the main checkout, which only follows main; a subagent's worktree
   is cut from its session's branch. So every gate judges only the tree its own agent works in: the
   edit the edited file, the commit the worktree's HEAD against what it commits, the push the
   worktree's HEAD against the latest main. A file another session left behind can then never block
   your gate. Merge, never rebase unless it is needed. The person in their words: "kazda session si
   udela svuj worktree pod .claude/ of the project", "there should be no shared checkout ever".
2. The main agent pushes main after a merge, when a task or a batch finishes, so local commits
   never pile up. A worker never pushes.
3. Work lands in this order, with no pull request until the person says otherwise: a worktree, a
   local test, `/simplify`, a local review agent, then a merge to main, then the push of item 1. A
   step skipped is named, never silent.
4. `/simplify` runs before the review, and the review reads the code that will land, because
   `/simplify` can drop code that handles an edge case it did not recognise and only a review
   after it catches that. Fix every review finding that holds, nitpicks included, before you push,
   because a second round trip costs more than a one-line fix; a fix that changes more than the
   finding's lines gets the reviewer back on that fix. The person in their words: "spis napred
   simplify a potom review".
5. Ask `gh` for `--json` when the output is read by a program. Read fresh comments with
   `gh api repos/<owner>/<repo>/issues/<n>/comments`, because `gh issue list --json comments` lags
   behind.
