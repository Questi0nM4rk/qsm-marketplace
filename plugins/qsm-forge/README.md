# qsm-forge

Read, answer, resolve and submit review threads on a GitHub pull request or a GitLab merge request,
one call per step, for the person and the agent who review code together.

## Why it exists

The harness default for review threads is raw `gh api`, `glab api` and `curl` calls, several
per step: a GraphQL listing, a lookup of the thread behind a comment, then the mutation. qsm-forge
replaces them with one atomic verb per step, the same shape on GitHub and GitLab, run under the
human's own account, and a hook refuses the raw route so the agent cannot drift back to it. It
takes the stance that a forge is a place to act, never to browse, and it refuses to be the review
methodology or to post anything the human did not ask for. When both forges expose this as one
safe primitive, this plugin can go.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `review-threads` | Reads, answers, resolves, dismisses and submits review threads through the CLI |
| Hook | `tool.call` on Bash | Refuses raw `gh api`, `glab api` and `curl` calls that touch review state |
| CLI | `qsm-forge` | 14 verbs (`gh`, `gl`, `doctor`), see [USAGE.md](USAGE.md) |

## Install

```bash
claude plugin install qsm-forge@qsm-marketplace
bun plugins/qsm-forge/scripts/install.ts
gh auth login     # and/or glab auth login
```

The install script compiles `qsm-forge` and links it into `~/.local/bin`. It never installs `gh` or
`glab`. More in [INSTALL.md](INSTALL.md).

## Use

Ask: "what is unresolved on PR 12?" or "reply to that comment and resolve the thread". The skill
fires and runs the verbs for you. You can run them yourself:

```bash
qsm-forge gh threads 12
qsm-forge gh reply 12 98765 --message "Fixed in abc1234"
qsm-forge gl resolve 7 42
qsm-forge gh submit-review 12 --file review.json
```

The repository is the checkout's `origin` remote. `--repo owner/name` (gh) or
`--project namespace/project` (gl) names another. All verbs: `qsm-forge --help`.

## Caveats

- It runs under your own `gh` or `glab` login. The binary never reads a token.
- A reply resolves the thread on GitHub, not on GitLab. Use `gl resolve` there.
- `comments`, `resolve-all` and `dismiss-reviews` exist for GitHub only.
- GitLab `submit-review` is several requests. A failure part-way leaves what was already posted.
  The payload is checked before the first request.
- `qsm-forge doctor` checks that `gh` or `glab` is on PATH, not that you are logged in.
