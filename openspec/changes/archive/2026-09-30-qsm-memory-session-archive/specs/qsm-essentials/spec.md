## REMOVED Requirements

### Requirement: The installer projects memory rules

**Reason**: qsm-memory no longer holds a `rules.md`. A rule lives in the instruction file or the
skill it belongs to, written by the agent or the user when the rule is found; there is nothing to
project into the Claude home.

**Migration**: the essentials activation drops the symlink step and its tests. An existing
`~/.claude/rules/memory-rules.md` symlink is removed by hand together with `~/.memory/`; the
user rules it pointed at move into `~/.claude/rules/` first.
