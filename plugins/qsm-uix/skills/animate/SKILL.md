---
name: animate
description: "Use when asked to build one animation or one transition for a popout, dropdown, panel, modal, toast, or button press, add motion, make an opening feel smooth, pick an easing curve or duration. Triggers: animate this, add a transition, the popout appears abruptly, slide-in, easing curve, how long should it take, spring, animuj to, pridej animaci, plynule otevirani. Decides first whether it should animate at all, then the curve, duration and properties; writing it in a stack is its family skill (desktop-ui, qml-ui, cli-ui, tui-ui, web-motion). Judging existing motion is review-animations; surveying a codebase is improve-animations; frame drops are animation-performance."
---

# Animate

An agent asked for motion picks its own curve and duration, and picks wrong: `ease-in` on an enter,
`scale(0)` from nothing, a transition on every property, an animation on a keyboard action. This
skill serves the person who builds an interface and must answer for how it feels: it turns a request
for motion into an implementation that survives `review-animations` the first time. The first answer
is sometimes "do not animate", and that is a result, not a dodge. Never present motion options as a
menu: make the call, give the reason in one line, write the code.

## The sequence, in order

Steps 1 and 2 gate everything; no curve is chosen before they pass.

### 1. Should it animate?

| How often the user sees it | Decision |
| --- | --- |
| 100+ times a day (keyboard shortcut, launcher or palette toggle) | No animation, ever. Stop. |
| Tens of times a day (hover, list navigation) | Near-imperceptible, fast and subtle, or nothing |
| Occasional (modal, drawer, toast, settings) | Standard animation |
| Rare or first-time (onboarding, success, celebration) | The delight budget lives here |

A keyboard-initiated action is a disqualifier, not a judgment call: Raycast has no open or close
animation, and that is correct for something opened hundreds of times a day. Say so plainly, write
no animation, and offer the non-motion alternative (instant state change, a static cue).

### 2. Name the purpose

One of: feedback (the interface heard the user), spatial consistency (where it came from or went),
state indication, preventing a jarring change, explanation (marketing and onboarding only), delight
(rare tier only). No name, no animation. Also check function: data the user is reading or acting on
does not move for style.

### 3. Pick the cheapest tool

A transition for hover, press, colour, a state you toggle. A predetermined animation for motion
that must stay smooth while the interface is busy. Script control only when something must steer
it. A spring or a library only for springs, layout and exit animations, or gesture-driven values.

### 4. Pick the properties

- `transform` and `opacity` only. Size, margin, padding and position trigger layout and paint;
  a height is tolerated for an accordion.
- Never `scale(0)`. Start from `scale(0.9` to `0.97)` with `opacity: 0`, because nothing real
  appears from nothing.
- Transform origin at the trigger for popover, dropdown, menu, tooltip. A modal is exempt and stays
  centred.
- `translate` percentages are relative to the element's own size: `translateY(100%)` moves by its
  own height whatever the content. Prefer them to pixels.
- No state changes layout bounds. A press is a scale while pressed, which
  keeps the box; hover, focus and disabled change colour, opacity or shadow only (ui-design owns the
  no-layout-change rule).

### 5. Easing and duration, or a spring

| Situation | Easing |
| --- | --- |
| Entering or exiting | ease-out |
| Moving or morphing on screen | ease-in-out |
| Hover or colour change | ease |
| Constant motion (marquee, progress) | linear |
| Default | ease-out |

Never ease-in on UI: it starts slow, which is the moment the user watches. Ease-out at 200 ms feels
faster than ease-in at 200 ms. The built-in keywords are too weak; use these three, never an
invented `(0.4, 0, 0.2, 1)`:

| Token | Points x1, y1, x2, y2 | Use |
| --- | --- | --- |
| ease-out | `0.23, 1, 0.32, 1` | enter, exit, press, default |
| ease-in-out | `0.77, 0, 0.175, 1` | movement already on screen |
| ease-drawer | `0.32, 0.72, 0, 1` | drawers and sheets |

A curve that is not here comes from easing.dev or easings.co, never hand-rolled.

| Element | Duration |
| --- | --- |
| Button press | 100 to 160 ms |
| Tooltip, small popover | 125 to 200 ms |
| Dropdown, select | 150 to 250 ms |
| Modal, drawer | 200 to 500 ms |

UI stays under 300 ms: a 180 ms dropdown feels more responsive than a 400 ms one. Speed is
perception too: a faster spinner makes loading feel faster at the same load time. The one named
exception is the toast: `ease` at 400 ms, because its motion is tuned to the component's
personality (Sonner reads as elegant that way), not to the generic UI budget.

A spring instead for a drag with momentum, an element that should feel alive, a reversible
gesture, or decorative mouse tracking: duration 0.5 s with bounce 0.2 (easier to reason about)
or mass 1, stiffness 100, damping 10 (more control). Bounce 0.1 to 0.3, and none in most UI:
drag-to-dismiss and playful moments only.

### 6. Interruption and exit

- Transitions, not keyframes, for anything the user can fire twice in a second (toast, toggle):
  a transition retargets from the current value, a keyframe restarts from zero.
- Springs for gestures, because they carry velocity through an interruption.
- Exit the way it entered: a toast in from the bottom leaves through the bottom, which is what makes
  swipe-to-dismiss obvious.
- Asymmetric timing where the user is deciding: slow on the deliberate phase (hold-to-confirm
  press, 2 s linear), snappy on the system's answer (release, 200 ms ease-out).

### 7. Reduced motion and pointer gating

Both ship with the animation. Reduced motion means fewer and gentler, not zero: keep opacity and
colour changes that aid comprehension, drop movement and position changes. Hover motion only where
a real pointer hovers.

## Recipes

| Case | Recipe |
| --- | --- |
| Button press | scale 0.97 while pressed (0.95 to 0.98), 160 ms ease-out. No hover gate: a press is real |
| Dropdown, popover, menu | origin at the trigger; from `scale(0.95)` + opacity 0, 200 ms ease-out |
| Tooltip | as a popover, 125 ms, from `scale(0.97)`; once one is open, neighbours open with 0 ms and no delay |
| Modal | centred origin; `scale(0.96)` + opacity 0, 250 ms ease-out; backdrop opacity on the same 250 ms |
| Drawer, sheet | `translateY(100%)` to 0, 500 ms ease-drawer; with drag it becomes a gesture (below) |
| Toast | enters from `translateY(100%)` with opacity 0, 400 ms `ease` (the exception above) |
| Accordion | height + opacity, 200 ms ease-out, content height measured |
| Stagger a group | 30 to 80 ms between items, `translateY(8px)` + opacity, 300 ms ease-out; only for a view seen occasionally, never blocks input |
| Hold to confirm | a wipe from empty to full: press 2 s linear, release 200 ms ease-out, plus the press scale |
| Tab indicator with colour change | duplicate the tab list styled active, clip the copy to the active tab, animate the clip 250 ms ease-in-out |
| Crossfade that shows two objects | `blur(2px)` with opacity 0.7 for 200 ms; blur under 20 px |

Drag to dismiss: springs, not durations. Dismiss on a flick, not only distance: velocity
`abs(distance) / elapsedMs` above about 0.11. Capture the pointer once the drag starts, ignore extra
touch points, damp the movement past an edge (friction, not a wall), and settle with a spring so an
interrupted drag keeps its velocity.

## Never ship

a transition on every property; `scale(0)` entrance; ease-in on UI; built-in `ease-out` on a
deliberate animation; animation on a keyboard shortcut; UI over 300 ms without a reason; centre
origin on a trigger-anchored popover; keyframes on a rapidly triggered element; animated layout
properties; ungated hover motion; no reduced-motion variant; everything entering at once.

## Say it in the reply

The code, then at most three lines: the gate result (frequency tier, named purpose, anything
rejected and why), the ingredients (tool, properties, curve, duration or spring), and what to
feel-check because code cannot show it: play it at 2 to 5 times the duration, step it frame by
frame, test gestures on the real device, look again the next day.

How each rule is written on a stack is its family: desktop (desktop-ui, qml-ui), terminal
(cli-ui, tui-ui), web (css-ui, react-ui, web-motion).

Adapted from skills/animate/SKILL.md, skills/animate/RECIPES.md and the motion half of
skills/emil-design-eng/SKILL.md in github.com/emilkowalski/skills, MIT licence, Emil Kowalski.
