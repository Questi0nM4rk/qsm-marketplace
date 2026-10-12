#!/usr/bin/env bash
set -euo pipefail
mkdir -p vault/til vault/concept vault/project
cat > vault/til/git-worktree-prune.md <<'EOF'
---
title: git worktree prune
created: 2026-03-02
type: til
tags: [git, worktree]
---

# git worktree prune

Removes the records of worktrees whose directory is gone. See [[git-rebase]].
EOF
cat > vault/concept/git-rebase.md <<'EOF'
---
title: git rebase
created: 2026-02-11
type: concept
tags: [git, history]
---

# git rebase

Replays commits on a new base.
EOF
