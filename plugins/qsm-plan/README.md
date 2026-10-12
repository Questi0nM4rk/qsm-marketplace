# qsm-plan

The one entry point for planning work of any size, for a developer who wants a fix to stay a commit
and a project to start from settled decisions.

## Why it exists

Claude's default is to start building the moment an ask arrives, whatever its size: a five-line fix
gets a project's ceremony, or a project gets built on a guess. qsm-plan replaces that default with
one flow that sizes the ask, settles what is still undecided through grilling, writes the epic with
its acceptance criteria, and splits it into tasks that each get a spec. A fix stays a commit. It
refuses to write the specs, tasks or code itself, and to plan a thing that should just be done. When
every ask arrives at its right size with its decisions settled, this plugin has no reason to exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `plan` | Sizes an ask, then routes it: a fix is a commit, anything larger becomes an epic split into tasks that each get a spec change |
| Skill | `grilling` | Asks the open decisions in one batch per round, each with a recommendation, and writes the epic's intent and acceptance criteria after your yes |

## Install

```bash
claude plugin install qsm-plan@qsm-marketplace
```

Brings `qsm-tasks` with it: it serves the task port, where an epic and its tasks live. Brings
`qsm-openspec` with it: it serves the spec port, where each piece of an epic gets its spec change.

## Use

Skills fire on the kind of ask, so there is nothing to call.

- ask: "plan this: I want a plugin that does X" loads `plan`, which sizes it first.
- ask: "how big is this?" loads `plan`.
- ask: "grill me on this design" loads `grilling`.
- ask: "what is still undecided?" loads `grilling`.

## Caveats

- Skills are guidance, not code: nothing enforces the sizing.
- It writes no spec, task or code itself. It hands each to the plug-in that owns it.
