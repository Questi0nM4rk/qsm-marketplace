# qsm-openspec

Spec-first development for a developer and an agent: skills that carry one change from proposal to
archive on top of the OpenSpec CLI.

## Why it exists

A change that starts in code ends in code nobody can review against an intention. qsm-openspec
exists so a change starts as a spec: what the system does and what proves it, written as
requirements and scenarios that the code, the tests and the review are read against. It takes the
stance that a spec is a developer's professional note, written better than the agent would
without it, and that it ends by closing the work it started. It refuses to be a tracker, a design
essay, or a place where history accumulates. When code can be reviewed against intention without
a spec, this plugin has no reason to exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `spec-propose` | Turns a settled idea into an apply-ready change, or revises a plan that no longer matches reality |
| Skill | `spec-apply` | Implements an apply-ready change and works through its tasks |
| Skill | `spec-archive` | Merges the change's delta specs into the durable specs and closes the change |
| Hook | `$.openspec` noun | Gives other plug-in hooks the `doctor` verb as `$.openspec.doctor()` |
| CLI | `qsm-openspec` | 1 verb, see [USAGE.md](USAGE.md) |

## Install

```bash
claude plugin install qsm-openspec@qsm-marketplace
bun plugins/qsm-openspec/scripts/install.ts
openspec init --tools none   # once per project
```

Compiles `qsm-openspec` and installs the upstream
[OpenSpec CLI](https://github.com/Fission-AI/OpenSpec) unless it is there. `--tools none` stops
upstream from generating prompts that duplicate the skills. Details are in [INSTALL.md](INSTALL.md).

Brings `qsm-essentials` with it: `spec-apply` hands disjoint tasks to its subagents skill. Brings
`qsm-tasks` with it: it serves the task port, where each change's task is created, claimed and
closed.

## Use

Skills fire on the kind of ask.

- ask: "write a spec for this feature" loads `spec-propose`.
- ask: "implement the proposal" loads `spec-apply`.
- ask: "we are done with this change, archive it" loads `spec-archive`.

```bash
qsm-openspec doctor
qsm-openspec doctor --root ~/Projects/my-repo
```

## Caveats

- Every repository needs its own OpenSpec root, or the CLI resolves to an ancestor's and writes
  there silently. The skills stop instead.
- `doctor` exits 4 (`missing`) when the `openspec` binary is not on `PATH`. The report still prints.
