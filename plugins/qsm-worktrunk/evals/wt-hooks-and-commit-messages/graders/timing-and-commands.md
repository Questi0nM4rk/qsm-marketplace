---
type: llm
focus: trace
---

PASS if the dependency install is a hook that blocks before the workspace is usable, the lint,
typecheck and test checks are in hooks that run before the merge or commit and can stop it (not
in an after-merge hook that only logs), the commands match this project's package.json scripts,
and the proposed claude command for commit messages gives the model no tools. FAIL if a check is
placed in a hook that cannot block, or a command is invented that package.json does not have.
