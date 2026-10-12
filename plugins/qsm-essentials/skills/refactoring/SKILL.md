---
name: refactoring
description: "Use when changing code structure without changing behaviour, when a change is too big for one commit, or when legacy code has no tests and must change. Triggers: refactor this, clean this up, this file is a mess, legacy code, characterization test, rewrite or refactor, strangler fig, branch by abstraction, split this commit. Judging a module's shape is software-design."
---

# Refactoring

Refactoring changes structure, not behaviour, in steps so small each is obviously safe. The point
is to make the next change easy, so with no change coming, the mess waits. It starts by asking
for a full index of the code, works through every caller and call site it lists, and ends with a
plan better than a plain model's: ordered steps, each proved by a run, each its own commit. This
skill does not tidy code nobody is touching and does not add behaviour: one hat per commit,
structure or behaviour.

## Plan from the index

- Start the code index before you read anything else: build it for the absolute repo path, then
  check its status until it is built (a code index tool that searches and lists callers; the
  installed plug-in's own skill has the calls). A plan made from
  the files you happened to open misses the callers you did not.
- List every user of what you will change with the index's impact query, then grep the name as text
  as well, because the graph cannot see a name held in a string, a config file, a script, a test, a
  doc or a dynamic dispatch table. `unknown` from the index means no user found, not safe. Put each
  hit in the plan as a line: file, kind of use, the step that migrates it.
- Name each step as one known move (extract, inline, rename, move, change signature, split phase,
  introduce parameter object) and give it the run that proves it. A step with no named run is not
  yet a step.
- Order the steps so each makes the next smaller: first the step that pins behaviour, then the
  preparatory ones that make the change easy (separate what varies from what stays), then the
  change itself as the last, separate, behaviour commit. Steps that touch different callers are
  independent and can be reordered; say which.
- Find the shortest path through the callers, not the neatest end state. Stop when the coming
  change is easy.

## Rules

- Refactor only inside the lines of a change you are making, in its own commit before it: make the
  change easy, then make the easy change. A cleanup beyond that is scope the person must read.
  A smell you meet mid-change is a task in the task tool, not a fix. A bug you meet is a finding for
  debugging with its reproduction, not a fix, because a fix inside a refactoring cannot be told
  from a slip.
- Pin behaviour first by running the real path (the bin, the request, the flow) and keeping its
  output, odd behaviour included. That records what the code does, not what it should. Write it as
  a test file only when you must repeat it over many steps.
- One step, then rerun the pinned run. Red: undo the last step, do not debug, because a step that
  cannot be undone cleanly was two steps.
- Rename through the language server, never search and replace, because replace also hits strings
  and unrelated names. A signature with many callers changes by parallel change: add the new form
  beside the old, make the old one forward to it, move one caller per step, and remove the old
  when `impact` and grep show no user. Two changes to one signature (a rename and a new parameter)
  are two sequences.
- No tests: find a seam (an interface to substitute, a function to wrap), pin there with real
  inputs, and fix no bug while pinning, because you could not tell your fix from your slip. New
  behaviour is sprouted in a new function called from one line of the old code.
- Too big for one commit: strangler fig (new beside old, move one caller at a time, old dies when
  unused), branch by abstraction (interface in front, new behind it, switch callers, delete old).
  Every step ships and main stays green. A rewrite needs the code to be neither readable nor
  pinnable, said before you start.

## Red flags

- When the pinned run stays red more than a few minutes, undo, because the step was too big.
- When the diff holds a behaviour change, split the commit, because the reviewer cannot tell
  which lines are safe.
- When the plan lists callers from the files you opened rather than from the index and a text
  search, redo it, because the missed caller breaks in production.
- When an extracted function needs "and" in its name, make it two.
- When you added an abstraction for one implementation, inline it.

## Say it in the reply

The plan as a table: step, the callers it touches, the run that proves it. Then three lines: what
changed structurally, which run shows the behaviour unchanged, and which coming change it made
easy. Smells and bugs met on the way are listed as tasks and findings, not as edits.
