---
name: animate
description: "Use when asked to build one animation or transition: animate a popout, dropdown, panel, modal, toast, or button press, add motion, make an opening feel smooth, pick an easing curve or duration. Triggers: animate this, add a transition, the popout appears abruptly, slide-in, easing curve, how long should it take, Behavior on opacity, Easing.BezierSpline, Hyprland animation or bezier line, cubic-bezier, spring, animuj to, pridej animaci, plynule otevirani. Decides first whether it should animate at all, then writes it on QML, Hyprland, CSS/React or TUI. Judging existing motion is review-animations; surveying a codebase is improve-animations; frame drops are animation-performance."
---

# Animate

An agent asked for motion picks its own curve and duration, and picks wrong: `ease-in` on an
enter, `scale(0)` from nothing, `transition: all 300ms`, an animation on a keyboard action. This
skill serves the person who builds an interface and must answer for how it feels: it turns a
request for motion into an implementation that survives `review-animations` the first time. The
first answer is sometimes "do not animate", and that is a result, not a dodge. Never present motion
options as a menu: make the call, give the reason in one line, write the code.

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

CSS transition for hover, press, colour, a state you toggle. `@starting-style` for entry on mount.
CSS animation for predetermined motion that must stay smooth while the page is busy. WAAPI
(`element.animate()`) for JS control with CSS performance. A motion library only for springs,
layout and exit animations, or gesture-driven values. A component (toast, drawer, menu) is a
library's job, not a hand-rolled `<div>`.

### 4. Pick the properties

- `transform` and `opacity` only. `width`, `height`, `margin`, `padding`, `top`, `left` trigger
  layout and paint. `clip-path` is the sanctioned third; `height` is tolerated for an accordion.
- Never `scale(0)`. Start from `scale(0.9` to `0.97)` with `opacity: 0`, because nothing real
  appears from nothing.
- Transform origin at the trigger for popover, dropdown, menu, tooltip. A modal is exempt and stays
  centred.
- `translate` percentages are relative to the element's own size: `translateY(100%)` moves by its
  own height whatever the content. Prefer them to pixels.
- `scale()` scales children too; on a press that is the point.
- No state changes layout bounds. A press is a `transform: scale()` on `:active` or pressed, which
  keeps the box (the one owner of this rule); hover, focus and disabled change colour, opacity or
  shadow only.
- Write `transform` on the element itself, never through a variable on its parent.

### 5. Easing and duration, or a spring

| Situation | Easing |
| --- | --- |
| Entering or exiting | ease-out |
| Moving or morphing on screen | ease-in-out |
| Hover or colour change | ease |
| Constant motion (marquee, progress) | linear |
| Default | ease-out |

Never ease-in on UI: it starts slow, which is the moment the user watches. Ease-out at 200 ms feels
faster than ease-in at 200 ms. The built-in CSS keywords are too weak; use these three, never an
invented `(0.4, 0, 0.2, 1)`:

| Token | cubic-bezier | Use |
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
| Marketing, explanatory | longer allowed |

UI stays under 300 ms: a 180 ms dropdown feels more responsive than a 400 ms one. Speed is
perception too: a faster spinner makes loading feel faster at the same load time.

A spring instead when the motion is a drag with momentum, an element that should feel alive, a
gesture the user can reverse, or decorative mouse tracking: `{ type: "spring", duration: 0.5,
bounce: 0.2 }` (easier to reason about) or `{ mass: 1, stiffness: 100, damping: 10 }` (more
control). Bounce 0.1 to 0.3, and none in most UI: drag-to-dismiss and playful moments only.

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
| Button press | `:active { scale(0.97) }` (0.95 to 0.98), 160 ms ease-out. No hover gate: `:active` is a real press |
| Dropdown, popover, menu | origin at the trigger; from `scale(0.95)` + opacity 0, 200 ms ease-out |
| Tooltip | as a popover, 125 ms, from `scale(0.97)`; once one is open, neighbours open with 0 ms and no delay |
| Modal | centred origin; `scale(0.96)` + opacity 0, 250 ms ease-out; backdrop opacity on the same 250 ms |
| Drawer, sheet | `translateY(100%)` to 0, 500 ms ease-drawer; with drag it becomes a gesture (below) |
| Toast | enters from `translateY(100%)` with opacity 0, 400 ms `ease` (slower, tuned to its character); `@starting-style` or a mounted flag |
| Accordion | `height` + opacity, 200 ms ease-out, content height measured, never animated to `auto` |
| Stagger a group | 30 to 80 ms between items, `translateY(8px)` + opacity, 300 ms ease-out; only for a view seen occasionally, never blocks input |
| Hold to confirm | `clip-path: inset(0 100% 0 0)` to `inset(0)`: press 2 s linear, release 200 ms ease-out, plus the press scale |
| Tab indicator with colour change | duplicate the tab list styled active, clip the copy to the active tab, animate the clip 250 ms ease-in-out |
| Scroll reveal | marketing only; `inset(0 0 100% 0)` to `inset(0)`, 600 ms ease-in-out, once |
| Crossfade that shows two objects | `blur(2px)` with opacity 0.7 for 200 ms; blur under 20 px |

Drag to dismiss: springs, not durations. Dismiss on a flick, not only distance: velocity
`abs(distance) / elapsedMs` above about 0.11. Capture the pointer once the drag starts, ignore extra
touch points, damp the movement past an edge (friction, not a wall), and settle with a spring so an
interrupted drag keeps its velocity.

## On each stack

**Quickshell QML.** Durations and curves are `Motion.*` tokens (qml-ui owns the singleton); write
the values above as tokens, never literals in a component.

- `Behavior on opacity { NumberAnimation { duration: Motion.fast; easing.type: Easing.BezierSpline;
  easing.bezierCurve: [0.23, 1, 0.32, 1, 1, 1] } }`. The array is his x1, y1, x2, y2, then `1, 1`.
  ease-in-out is `[0.77, 0, 0.175, 1, 1, 1]`, drawer `[0.32, 0.72, 0, 1, 1, 1]`.
- A Behavior retargets from the current value, so it is the transition; a `NumberAnimation` with
  fixed `from` restarts and is the keyframe. Use Behavior for anything triggered rapidly.
- Enter: `opacity` and `scale` from 0.95 with `transformOrigin` or a `Scale { origin }` at the
  trigger. Animate `opacity`, `scale`, `x`, `y`; not `width` or `height`, which re-lay-out children.
- Gestures and "alive" motion: `SpringAnimation { spring; damping; mass }`, tuned by feel.
- A layer-shell window vanishes the instant it is hidden, so an exit needs it kept visible until the
  motion ends: `visible: open || content.opacity > 0`.
- No state changes the hit area's bounds; a press scale is a transform and is allowed. Reduced
  motion is clamped in `Motion`.

**Hyprland.** The config is Lua. A curve takes his points directly: `hl.curve("easeOut", { type =
"bezier", points = { { 0.23, 1 }, { 0.32, 1 } } })`, then `hl.animation({ leaf = "windows", enabled
= true, speed = 2, bezier = "easeOut", style = "popin 95%" })`. Speed is in deciseconds, so 2 is 200
ms; `popin 95%` is his start scale 0.95. Layers: one owner per surface. A surface opened from a
trigger (popout, menu, tooltip) animates in QML with its origin at the trigger, and its layer
namespace gets no compositor animation (`hl.layer_rule({ match = { namespace = "..." }, no_anim =
true })`). A surface with no trigger (notification, OSD, a bar appearing) may use the compositor
instead: the `layersIn` leaf with `speed = 2, style = "fade"` and a faster `layersOut`. Never both.
A launcher or palette toggle gets neither (step 1). Workspace switches are keyboard-driven and
constant: the `workspaces` leaf with `enabled = false`, or at most a 2 to 3 decisecond `slide`.
Motion off entirely is `hl.config({ animations = { enabled = false } })`.

**CSS and React.** His form: custom properties `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`,
`--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`,
then `@starting-style`, `@media (prefers-reduced-motion: reduce)` and `@media (hover: hover) and
(pointer: fine)`, WAAPI, and `useReducedMotion()` in Motion. In Motion write `animate={{ transform:
"translateX(100px)" }}`, not `x: 100`, when the page is busy.

**TUI.** Most of this does not apply: a terminal redraws, it does not composite. What applies: no
animation for a keyboard-driven action, a spinner only on a TTY and never in piped output (tui-ui
owns the cadence rules), and a faster spinner reads as faster work. Easing, springs, origin and
stagger do not exist there.

## Never ship

`transition: all`; `scale(0)` entrance; ease-in on UI; built-in `ease-out` on a deliberate
animation; animation on a keyboard shortcut; UI over 300 ms without a reason; centre origin on a
trigger-anchored popover; keyframes on a rapidly triggered element; animated layout properties;
ungated hover motion; no reduced-motion variant; everything entering at once.

## Say it in the reply

The code, then at most three lines: the gate result (frequency tier, named purpose, anything
rejected and why), the ingredients (tool, properties, curve, duration or spring), and what to
feel-check because code cannot show it: play it at 2 to 5 times the duration, step it frame by
frame, test gestures on the real device, look again the next day.

Adapted from skills/animate/SKILL.md, skills/animate/RECIPES.md and the motion half of
skills/emil-design-eng/SKILL.md in github.com/emilkowalski/skills, MIT licence, Emil Kowalski.
