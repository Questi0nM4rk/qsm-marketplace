---
name: duplicates
description: "Use when the same thing may live in two places: duplicate guidance, local vs checked-in CLAUDE.md, a rule and a memory say the same, two skills fire on the same request, two agents with one name, an MCP server configured twice, two plugins that do the same thing, contradicting instructions. Names both places, recommends which stays, and proposes removing the other. Cutting one file's derivable lines is claude-md-trim."
---

# Duplicates

The same guidance written twice is paid for twice, and the copies drift until they disagree. Find
the pair, name both places, say which stays and why, propose removing the other. A disagreement that
changes behaviour is not a duplicate: quote both sides and leave it to the person. An extension
nobody uses, with no twin, is `unused-extensions`; here the pair is the finding. Shared reading and
apply rules are in the `usage` skill.

## Which stays

| Pair | Stays | Why |
| --- | --- | --- |
| `~/.claude/CLAUDE.md` or `CLAUDE.local.md` vs `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/*.md` | the checked-in file | the team sees and reviews it |
| rule vs note (auto-memory or `qsm-memory`) | the rule | it loads every session, a note expires |
| two skills, same triggers | the one used more in the ledger | narrow or switch off the other |
| two agents, skills or commands, one name | the one the user invokes | |
| one MCP server at two scopes | the narrowest scope that covers its use | |
| two MCP servers or plugins, one job | the one used more | the other is a removal |

Match by meaning, not wording. Two limits keep a removal safe: a rules file with `paths`
frontmatter or a nested `CLAUDE.md` is not always loaded, so it does not cover always-loaded
guidance; `~/.claude/CLAUDE.md` loads in every project, so remove from it only what is specific to
this project, or say the guidance is lost elsewhere.

## Reading

- Instruction files and rules: whole.
- Skill descriptions: `mcp__qsm-usage__breakdown`. Uses: `mcp__qsm-usage__ledger`.
- MCP scopes: `jq '.mcpServers | keys'` on `~/.claude.json`, its project entry, and `.mcp.json`.
- Notes: the auto-memory files under `projects/*/memory/` and `qsm-memory notes --all`. Without
  `qsm-memory` on PATH, say so and skip notes.
- Saving: `qsm-usage count <file>`, labelled an estimate.

## Findings

Each names both places (path and line, or scope and name), quotes the removed text, gives the
change (an edit, a narrowed description, a switch from `unused-extensions`, or `qsm-memory note
--drop <id>`). Duplicate: `verdict: "fix"` (`"remove"` for a whole extension), `question:
"cleanup"`. Contradiction: `verdict: "warn"`, `question: "none"`, `change.kind: "none"`, both sides
in `evidence`; recommend nothing unless one side is plainly stale.

## Red flags

- When two lines share words but differ in condition or scope, treat them as different, because a
  removal would lose the narrower rule.
- When the copy to remove is in a file the team does not own, name it and let the person decide,
  because the edit is theirs.

## Say it in the reply

The pairs, biggest saving first: both places, the quoted text, which stays and why, the saving.
