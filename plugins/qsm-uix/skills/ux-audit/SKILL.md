---
name: ux-audit
description: "Use when asked to evaluate how a UI behaves and feels rather than how it looks. Triggers: audit the UX, is this discoverable, review the interaction, review the flow, does the feedback feel right, are these click targets big enough, is deleting this safe, what happens on a bad input, is this mode obvious, zkontroluj ovladani, jak se to chova. Covers discoverability, feedback, targets, mode visibility, interruption cost, vocabulary, reversibility, error recovery and forms. Static pixels, spacing, colour and typography belong to ui-audit; motion to review-animations; keyboard, focus and screen reader to a11y-audit."
---

# UX Audit

Behaviour is judged from evidence of behaviour. A resting screenshot proves nothing about
interaction, so this skill drives the interface, times it, and measures targets before saying how it
feels, replacing "presumably clickable" with traces and numbers. Out of scope: static visuals
(ui-audit), motion judgement (review-animations), accessibility criteria (a11y-audit), building the
fix (the stack skill), redesigning.

## Evidence first

1. **The state-space map.** Enumerate every surface, mode, and transient state from the
   application's introspection surface or command surface plus the design source. It is the first
   deliverable, and every later claim points at a state actually visited.
2. **Interaction traces.** Trigger each transition through the application's control surface and
   record before, during, after. Under about 500ms, poll the introspection surface: it resolves to
   whatever the poll costs, a capture sequence only to 100ms to 200ms per step.
3. **Target geometry.** Hit-target sizes and positions come from the introspection surface, never
   from what is painted. An invisible hover zone is a target, and a glyph smaller than its zone is
   a different finding from a target that is too small.
4. **Source-verified values.** Timers, delays, durations read from code or tokens, cited by file
   and line, then cross-checked against the traces, because a trace alone cannot tell a deliberate
   value from a busy machine.

What the person says they observed is evidence. A flow they did not try and you cannot drive
goes to Needs human trial with the exact steps and the pass criterion.

Someone may be at the machine. Say which surfaces you will drive first, and inject no synthetic
input while they work, because stealing focus costs more than the audit finds.

## The checks

1. **Discoverability.** For every hidden surface list its invocation paths: hover zone, keybind,
   control socket, click. A surface reachable only by keybind or socket with no visual hint is a
   finding, severity by how core it is. Measure each hint against its backdrop with
   `qsm-uix contrast shot.png --fg X,Y --bg X,Y`: a hint that is the only way in needs 3 or better,
   and under 1.5 it is decoration. More than one hint style for one behaviour class is a finding.
2. **Affordance and feedback.** Every input gets a visible answer within about 100ms. Anything at or
   over 1 s gets a progress affordance; a near-instant action must not flash a spinner. A state that
   changes the layout bounds is a finding (the rule is ui-design's), because moving the target under
   the cursor makes the click miss. Interactive elements separate from passive readouts without
   hovering; state the rule and check it sorts every element. A stateful control shows it, the
   states differing by a contrast ratio of at least 1.2.
3. **Target ergonomics.** A surface that opens on hover opens on entry with no delay, stays open
   inside the union of its trigger, its panel and the straight path between them, and closes
   180 ms after leaving that union. Measure the zone from that union, never from the painted
   trigger: a hit zone equal to the painted shape needs pixel-perfect aim and is a finding.
   Measure the hit area, padding and hover zones included. The floor is
   24 by 24 px for a desktop pointer (WCAG 2.5.8), 32 by 32 for anything used often. Screen edges
   and corners are effectively infinitely deep, so a rect touching the boundary inherits that and
   a 2px inset throws it away. Adjacent targets sit at least 8px apart edge to
   edge, or the closest pair carries a mis-click finding. A corner spent on a destructive action is
   a finding.
4. **Mode and state visibility.** From any single frame a viewer can name the current mode: which
   surface is open, which workspace, which suppression is on. Capture each mode and name the pixel
   that distinguishes it; none is a finding. A fact shown in two places agrees in every captured
   pair.
5. **Interruption cost.** Inventory everything that appears unbidden. Per item: occluded area,
   position against the likely focus zone, auto-dismiss timing from the source, and the manual
   dismiss path with that target's measured size. Measured lifetime matches the documented timeout
   within 10 percent. Where a suppression mode exists, trigger something during it: suppressed
   items must land somewhere recoverable. An interruption never moves keyboard focus.
6. **Vocabulary consistency.** Build the gesture table: each input (left, right, middle click,
   scroll, hover, drag) against each surface. One input means one class of thing everywhere, the
   same dismiss gesture works on every dismissible surface, the same concept carries the same label
   and icon, and every transition's duration and easing are traced to a motion token in the source
   (whether the values are right is review-animations'). Navigation keeps one
   placement, marks the current location, and keeps state when the user goes back. The wheel over
   a scrolling list scrolls that list: a row that expands never takes the wheel for its own body,
   and expands by click on its leading part, the rest of the row being its action, with no
   hover-expand inside a scrolled list. Check: scroll with an expandable row under the pointer;
   the list must move.
7. **Motion.** Every animation, its purpose, timing, curve and interruption, is judged by
   review-animations; run it for this surface and file its verdict here, never a second ruling.
   This audit adds only the measurement on a running surface:
   - Read the duration and easing tokens from the source first, then poll the introspection
     surface across the transition and build the timeline from mid-flight values.
   - Open and close land within the motion token plus 10 percent and settle on the resting
     geometry.
   - With pixels only, `qsm-uix burst --count 8 --interval 120 --out-dir frames/` gives frames with
     real elapsed time, honest to 100ms to 200ms per step and no finer. Say that limit.
   - `qsm-uix diff a.png b.png` (distortion under 0.001) works only on a frozen scene; on a live
     desktop use tree equality and say which you used.
8. **Reversibility.** For every destructive or hard-to-repeat action, trace what happens after it.
   Undo beats a confirm dialog: people click through confirms. Silent and instant with no
   undo is a finding; so is a confirm for a trivial action. The destructive control is separated
   from the primary one and signalled with a danger cue that clears the 1.2 ratio against its
   neutral siblings. One primary action per screen; secondary ones read as subordinate.
9. **Error recovery and forms.** Drive the bad path, not only the good one: empty, malformed,
   server refusal. Per failure record where the error appears (beside the field), whether it names
   cause and fix, and whether the input survived. Fields have a visible label, validation fires on
   blur, and after a submit with errors a summary exists and focus lands on it. A failure with no
   way forward is a blocker. Building the form is the stack skill's job.

A heuristic violation with no nameable user-visible consequence is not a finding: name the failure
scenario or drop the row.

## The findings table

| id | check | interaction | evidence (traced or measured) | expected (source) | actual | severity |

Severity is `blocker`, `major`, `minor`, or `polish`. Evidence cites a visited state, a recorded
trace, a measured target, or a file and line. A claim about a surface never opened is not filed,
softened or otherwise: drive it there, or it goes in Needs human trial. Two design
sources that disagree are one finding citing both, tagged `source-conflict`. Under the table:
**Hypotheses** (unmeasured suspicions, each labelled as one), **Needs human trial** (what needs a
live hand: real hover, drag, touch, a physical device; each entry the exact steps and what counts
as a pass) and **Not examined** (what was not reached, and why).

## Red flags

- When you write "presumably", "likely", or "should be" about a behaviour, drive it and trace it,
  as those words mark a claim nobody observed.
- When a target-size claim has no measured geometry or a feedback claim no before-and-after trace,
  get it: painted size and felt response differ from the claim.
- When a timing comes from a trace alone, find the source value: a busy machine looks like a slow
  design.
- When you judge a delete or a save from the code path, drive it with a bad and a good input:
  recovery lives in what the user sees.
- When the audit runs from the resting frame, enumerate states: defects live in the transitions.
- When the finding is keyboard path, focus, screen-reader names, or reduced motion, write one line
  "accessibility criteria are a11y-audit's; run it for this surface", because it owns that method.

## Say it in the reply

The state-space map, the table, the three lists, then one line on how the interface was driven and
what could not be, so the reader knows which half the audit saw. With no running UI, still give
the standards with their numbers (24 px floor, 32 frequent, 100 ms feedback) as the check to run,
the human-trial steps with a pass criterion, and what was not examined.
