## ADDED Requirements

### Requirement: Every hook is a function hook, and a classic hook is a measured exception

A plugin's hooks SHALL be function hooks in `hooks/register.tsx`, on `tool.call`,
`session.start`, `session.end`, `session.compact` or `prompt.submit`. They SHALL NOT use
`classic.*` or `prompt.section`, `prompt.context`, `prompt.compose`: under managed settings
the engine's `cc-plugin-sec-default` bypasses a user-tier plugin there. A Bash guard SHALL
be a `tool.call` hook that answers `{ deny }`. A classic command hook SHALL exist only for
an event the engine has no function event for, and its source `hooks/<name>.ts` SHALL open
with a comment `classic: <event> has no function event`. Four exist: `qsm-langdev`
`gate-hook` (SubagentStop) and `qsm-worktrunk` `worktree-create`, `worktree-remove` and
`notification-marker`. The gate SHALL print every classic hook and fail on one without the
comment.

#### Scenario: a classic hook without a reason fails the gate

- **WHEN** a plugin's `hooks.json` declares a classic hook whose source lacks the `classic:` comment
- **THEN** the gate fails naming the plugin and the hook

#### Scenario: a migrated guard denies what the classic guard denied

- **WHEN** a migrated guard sees a command its classic form denied
- **THEN** it answers `{ deny }` with the same reason text
