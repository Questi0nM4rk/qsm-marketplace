---
name: claude-md-trim
description: "Use when instruction files have grown: my CLAUDE.md is too big, trim CLAUDE.md, slim my instruction files, my rules are too long, move rules into skills, lazy-load instructions, my startup is heavy, zmensi CLAUDE.md. Cuts lines a session could derive from the code and moves always-loaded guidance that is needed only sometimes to lazy loading. Duplicates between files are the duplicates skill."
---

# CLAUDE.md trim

Every line of an always-loaded instruction file is paid for in every session, and a file full of
what the code already says buries the few lines only the person could write. This skill cuts in
two passes, in order, so the second never works on text the first deletes. Each cut or move carries
its own reason, because a line gone without one may be the line only the person could write. It
changes nothing the person did not confirm. Shared reading and apply rules are in the `usage` skill.

Surfaces: `~/.claude/CLAUDE.md`, `~/.claude/rules/*.md`, the project's `CLAUDE.md`,
`.claude/CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `.claude/rules/*.md`, every `@path` they pull
in, and the memory index loaded at start (`MEMORY.md`).

Measure in tokens: `qsm-usage count <file> ... --total --json`, labelled an estimate. Lines only
orient, because a short dense file can cost more than a long one. Claude Code warns when a file
passes about 5% of the window in characters (40,000 at least): name those before and after.

## Pass 1: cut what the code already says

Could a fresh session rebuild the section with `ls`, the manifest, or `--help`? Then cut it:
directory layouts, stack and dependency lists, standard build and test commands, signatures and
schemas copied from source, architecture tours, generic advice, rules a hook, linter or CI already
enforces. Keep gotchas ("X looks safe but does Y"), why it is this way, conventions that differ from
the tool's default, "never do X" rules, branch and commit conventions, commands with required flags,
and pointers (`@path`, skill names). When unsure, keep it, because a wrongly cut "never" rule costs
more than its tokens; never cut one for looking generic. A rule written in two sections is one cut:
the second copy goes and the finding says where the first stays. A "never" rule loses a copy only
while another copy stays in the always-loaded file. A lean file gets one line: "already lean,
nothing to cut".

A memory index that lists every record can become one line per room; the records stay.

## Pass 2: move what survives to lazy loading

- Guidance for one package or directory goes to `<dir>/CLAUDE.md` or a rules file with `paths`
  frontmatter, loaded only there.
- A task workflow (deploy, release checklist, API reference) becomes
  `.claude/skills/<name>/SKILL.md`; only its description stays resident.
- Universal constraints, global style and every "never do X" stay in the root file, because they
  must be loaded when they matter.

Each move names the source lines, the destination, and the saving: moved tokens minus what stays
resident (a description, a pointer line).

## Findings

Quote every removed or moved block so the person can judge it and the report can undo it. Each
finding carries a reason that fits that block alone: the command or file that already says it, or
the surviving copy and where it is. "The file is long" is no reason. One
finding per cut or move: `change.kind: "edit"`, `target` the file, the block in `change.detail`,
`verdict: "fix"`, `question: "cleanup"`. Asked alone, per file: tokens now, what goes, what moves
where, tokens after. After applying, count again with the same command and show both totals.

## Red flags

- When a section looks derivable but states why a choice was made, keep it, because the code
  cannot say why.
- When a move leaves a "never do X" rule only in a lazy file, bring it back to the root, because
  it loads too late.
- When a saving ignores the pointer or description left behind, subtract it, because the
  resident part is still paid.

## Say it in the reply

Per file, tokens before and after, the files over the size warning, and the quoted blocks that go.
