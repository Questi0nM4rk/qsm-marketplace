---
name: software-design
description: "Use when cutting a module, designing an interface or a type, deciding where complexity lives, naming, or writing a comment. Triggers: design this module, is this abstraction right, split or join this, too many parameters, where does this logic go, deep module, information hiding, DRY or duplicate, how should I name this, is this over-engineered. Business rules and aggregates are domain-modeling, structure changes to existing code are refactoring."
---

# Software design

Every design decision asks whether a piece hides more complexity than its interface shows.
Complexity arrives as one more parameter, flag or special case, each reasonable alone, and it
shows as change amplification (one change, edits in many places) or cognitive load (many facts
held to do one thing). This skill serves the person who has to live with the code for years: say
no to the small additions and say why, with the questions to ask of each cut, the caveats and the
edge cases. It does not add abstractions for a future nobody asked
for, and the simplest design that does the job wins.

## Cutting a module

- Write one sentence: "a caller no longer has to know X". Without it there is a file with a name,
  not a module.
- Prefer deep: a small interface over a lot of behaviour. A class of twenty getters over three
  fields costs the reader as much as a real one and returns nothing.
- Design it twice: sketch two interfaces for the same job and take the one with the shorter,
  dumber call site, because the first idea is rarely the best and the second costs ten minutes.
- Pull difficulty down into the module. A config parameter is complexity handed back to the
  caller, so choose a default and expose the knob only when a real caller needs another value.
- Make it somewhat general: the interface serves this case and the next obvious one with few,
  wide methods, not a method per case. You can describe it without naming the current caller.
- Join or separate by tests, not taste: join when the pieces share knowledge, are always used
  together, or the joined interface is simpler than two; separate a general mechanism from the
  special case that uses it, because the special case then stops leaking into it.
- Things that change for different reasons live apart. Split by knowledge, not by time: all code
  that knows the file format or protocol sits in one place, whatever order it runs in.

## Interfaces

- The interface is the cost the caller pays forever: obvious names, few arguments, no order
  dependence, no state to reset. An hour on the signature saves every caller a minute.
- Define errors out of existence where the operation allows it (deleting a missing file
  succeeds, a substring past the end is empty), because every exception is interface surface.
- Where an error cannot be defined away, take one of three exits: mask it inside the module (a
  retry the caller never sees), aggregate many failures into one handler higher up, or crash on
  what no caller could repair. Each one removes a case every caller would otherwise write.
- Handle an exception where the knowledge to handle it lives. Elsewhere let it end the operation
  loudly with the cause named. Never catch to log and continue. A fallback the business chose
  (an empty recommendation list) is handling, not swallowing.
- A value with rules gets a type, so no caller remembers the rule.
- Hard to misuse beats documented: if a wrong call compiles and runs, redesign the signature
  before writing the warning (two booleans in a row, a string where an enum belongs).
- Return the useful thing and throw on failure, not a status code plus an out parameter.

## Where complexity lives

- Information leaks when two modules share a fact neither declares (a format, a call order, a
  constant). If changing a fact needs two edits, give it one owner.
- A new layer must speak a different abstraction than the one below. A method that forwards its
  arguments, a wrapper that adds one option, or a variable passed through five signatures only to
  reach the sixth are the same defect: give the knowledge to an owner at the level that needs it.
- A pass-through method adds a layer with no behaviour, so remove it or make it do something. A
  layer whose interface is the lower layer's with new names is not earning its place.
- Two methods you cannot understand apart are one method or a wrong boundary.
- A legacy system's shapes stay inside one adapter package that translates to the new design,
  because otherwise its limits become the new system's.
- DRY is one piece of knowledge in one place, not one string in one place. Two similar lines that
  encode different decisions stay two. Before extracting, ask whether both must change together.
- Prefer the design where the special case is the general case: an empty list is a list, one item
  is a batch of one, a missing config is a default.
- Tactical speed borrows against later. Default to the design, and when you borrow, say "tactical,
  because X, pay back by Y".
- Follow the existing convention before improving it, and improve it everywhere in one commit or
  nowhere, because a codebase with two conventions is worse than one with the old.

## Naming and comments

- A name is a design decision: if it takes more than a word or two, the thing does two jobs, so
  rename before you cut, because the rename shows where.
- Precise beats short (`activeUserCount`, `retryAfter`), and one concept has one name across the
  codebase, the domain's word when the domain has one. A name claims exactly what the thing does:
  a `ShoppingService` that handles only hotels lies, and the next feature lands in it. Siblings at
  one level should not overlap and together should cover the idea.
- Write the comment before the code as the interface's promise. A long comment means the
  interface is wrong.
- Comment what the code cannot say: the reason, the constraint, the rejected alternative, the unit,
  the invariant. A comment repeating the code is noise.

## Red flags

- When a module's interface is nearly as big as its body, merge it into its caller or move work in
  from the caller, because the reader pays for the interface and gets little.
- When you needed the implementation to understand a call, fix the name or interface first and
  only then comment, because a comment papers over the defect.
- When a function takes many flags or parameters, choose defaults, split it, or pass one named
  typed object, because the complexity was handed to every caller.
- When a method cannot be described without "and", split it, because it is two methods.
- When a name is `data`, `info`, `manager`, `handle` or `process`, decide what the thing is,
  because the name hides that nobody did.

## Say it in the reply

Two lines: what the module hides, and what the caller now writes. That is the whole design, and
it is what the user checks. When the design had a real choice, add the two interfaces you compared
and the one call site that decided it.
