---
name: permissions-tune
description: "Use when permission prompts get in the way: fewer permission prompts, pre-approve read-only commands, why was that denied, allowlist commands I keep approving, make auto mode my default, stop asking me for git log. Proposes auto mode as the default mode and exact allow rules for read-only calls that keep prompting, from transcript evidence."
---

# Permissions tune

Every prompt for a read-only command costs a decision that changes nothing. The built-in
`/fewer-permission-prompts` writes wildcard rules into project settings; this skill writes exact
rules for the observed calls into the local settings, because a wildcard also approves flags nobody
saw. Propose two things:
auto mode as the default, and exact allow rules for read-only calls that keep prompting. Both
widen what runs unasked, so each is its own question naming every change. Shared reading and apply
rules are in the `usage` skill. A prompt saves no tokens: `savingTokens` is 0, and `savingNote`
says the prompts removed ("~9 prompts per session").

## 1. Auto mode

Read `permissions.defaultMode` by key from user, project and local settings. Healthy: user says
`"auto"` and nothing overrides it. A project value other than `"auto"` wins over the user's: say
so. Skip with one line when managed policy sets `defaultMode` or any file has `disableAutoMode:
"disable"`. Otherwise propose `"permissions": {"defaultMode": "auto"}` in `~/.claude/settings.json`
only, because `"auto"` in project settings is ignored. It applies to every project.

## 2. Allow rules

The ledger records uses, not prompts, so read the ~50 newest transcripts.

1. **Collect** `user` entries with `toolDenialKind` (`user-rejected`, `permission-rule`,
   `automode-*`); `interrupted` and `cancelled` are aborts. Follow `tool_use_id` back to the
   `tool_use` for name and input. Older transcripts without the field: match the denial text, label
   counts unverified, never for `mcp__*` (the server writes that text).
2. **Rank.** Key Bash on command plus first subcommand (`git log`), MCP on the full
   `mcp__<server>__<tool>`. Drop under ~3 uses, keep the top ~20.
3. **Keep only read-only.** Drop: interpreters and runners (`python`, `node`, `bun`, `bash`,
   `npx`, `bunx`, `uvx`); wildcards of task runners (`npm run *`, `make *`, `just *`; exact
   `Bash(bun run typecheck)` is fine); `curl`, `wget`, `git fetch`, `git pull`, any `gh api`,
   `docker exec`, `kubectl exec`, `sudo`; `find -exec` or `-delete`; any `-c key=value`,
   `--exec-path`, `--upload-pack`, `VAR=x` prefix, pipe or redirection; anything under an existing
   `deny` or `ask` rule; commands Claude Code already allows (`ls`, `cat`, `git status`, `rg`, most
   read-only git and gh), because a denial there came from a rule or the classifier.
4. **Exact rules only**: `Bash(git log --oneline -20)`, never `Bash(git log *)`, because read-only
   subcommands have writing flags (`git log --output=<file>`, `git branch -D`) and transcript
   strings can be steered by prompt injection: an exact rule approves only what was observed. MCP:
   one full tool name per rule, never `mcp__x__get_*`.
5. **Mostly `user-rejected`** means the person said no: include the rule only with that stated.

Destination: `permissions.allow` in `.claude/settings.local.json`, never user scope, because the
evidence spans every project. Deduplicate; never touch `deny` or `ask`.

## Findings

One finding per rule and one for the mode: `change.kind: "edit"`, `target` the settings file, the
rule in `detail`, `verdict: "fix"`, `question: "permissions"`. Asked alone: a table `| # | Rule |
Count | Denial kinds | Why read-only |`, then what was skipped and why ("dropped `git push`:
writes; dropped `cat`: already allowed"). Ask once; apply only on yes; then say the file, the rules
added, and how to remove them.

## Red flags

- When a candidate is a wildcard, narrow it to the observed command or drop it, because a wildcard
  approves flags nobody saw.
- When the command was denied by a `deny` rule, skip it, because the person decided already.

## Say it in the reply

The table, what was skipped, and every rule and mode change awaiting a yes.
