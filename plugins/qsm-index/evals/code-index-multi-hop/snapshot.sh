#!/usr/bin/env bash
# Runs in the empty workspace, as the person, outside the sandbox: a snapshot of this marketplace's
# committed tree as its own git repository, so qsm-index has a repository to map. The wrapper
# writes the marketplace's root into <plugin copy>/.eval-repo; this script lives at
# <plugin copy>/evals/<case>/snapshot.sh.
set -euo pipefail
repo="$(cat "$(dirname "$0")/../../.eval-repo")"
git -C "$repo" archive HEAD | tar -x
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.invalid commit -q -m snapshot
