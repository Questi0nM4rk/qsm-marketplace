---
name: review-animations
description: "Use when asked to review, judge, or critique motion: an animation that feels off, a diff with transitions, a slide-in, easing, durations, whether something should animate at all. Triggers: review this animation, the slide-in feels off, what is wrong with this transition, is 400ms too slow, should this animate, ease-in, animace je divna, zkontroluj animaci. Defaults to flagging; approval is earned. Reading it in a stack is its family skill. Building motion is animate; a codebase survey with plans is improve-animations; dropped frames are animation-performance; static visuals are ui-audit."
---

# Review Animations

A transition that works but feels sluggish, grows from the wrong origin, fires too often or drops
frames is a regression, not a pass. This skill serves the person who must answer for how an
interface feels: it measures every animation in the diff against ten standards with their values and
defaults to flagging, because approval is earned. It owns the motion judgement in this plugin;
ux-audit hands motion here, so no two voices rule on one animation. It reviews motion only, writes
no feature, and declines general code review.

## The ten standards

A violation of any is a finding.

1. **Justified.** Every animation answers why: spatial consistency, state indication, feedback,
   explanation, or preventing a jarring change. "It looks cool" on a frequently seen element blocks.
2. **Frequency-appropriate.** Keyboard-initiated and 100+/day actions get no animation. Tens a day:
   remove or drastically reduce. Occasional: standard. Rare or first-time: delight allowed. A
   keyboard-driven toggle (launcher, palette, workspace switch) is no animation, with no exception.
3. **Responsive easing.** Enter and exit use ease-out or a strong custom curve; moving on screen
   uses ease-in-out; a colour change on hover uses ease, a hover that moves uses ease-out; constant
   motion is linear. Ease-in on UI blocks, because it delays the moment watched. Built-in keywords
   are too weak for a deliberate animation; `ease` is allowed only for the toast and for hover
   colour (animate's exception list).
4. **Under 300 ms, and few.** Each element's duration is in animate's table; marketing may run
   longer. Over 300 on a UI element needs a stated reason, and the toast is one. An exit takes 60
   to 70 percent of its enter duration. More than 1 to 2 animated elements per view is a finding,
   because motion that is everywhere points nowhere.
5. **Origin and physicality.** A popover, dropdown or tooltip scales from its trigger, not its
   centre (a modal stays centred). Never from a scale of zero: start from animate's start scale with
   opacity 0. Press feedback is a scale per animate's recipe. An exit leaves the way it entered (a
   toast in from the bottom leaves through the bottom).
6. **Interruptible.** What is triggered rapidly or by a gesture (toast, toggle, drag) retargets from
   the current value: transitions or springs, not keyframes that restart from zero. Decoration
   (a stagger) never blocks input while it plays.
7. **Cheap properties.** Only animate's whitelist; `width`, `height` (outside an accordion),
   `margin`, `padding`, `top`, `left` are performance findings. A transition on every property is
   always a finding.
8. **Accessible.** Reduced motion is honoured and means gentler, not zero: keep opacity and colour,
   drop movement. Hover motion follows ui-design's rule for a fine hovering pointer.
9. **Asymmetric where deciding.** Deliberate phases (press, hold, destructive confirm) run
   slower, the system's answer snaps (animate's hold-to-confirm recipe). Symmetric timing on a
   press-and-release is a finding.
10. **Cohesive.** Motion matches the component's character and the rest of the product: playful may
    bounce, a dashboard stays crisp. Five hand-typed near-identical curves is a consolidation
    finding. A crossfade that shows two overlapping objects is bridged with a blur of 2 px. When
    unsure whether motion feels right, the strongest move is often to delete it.

## Reference values

Curves, durations, press scale, springs, stagger, drag-dismiss velocity and the blur limit are
animate's tables. Pull a value from there, never approximate one.

## Escalate on sight

a transition on every property; a scale from zero or a pure fade with no initial transform; ease-in
on any UI; an animation on a keyboard shortcut or 100+/day action; UI over 300 ms with no reason;
centre origin on a trigger-anchored popover; keyframes on a toast or toggle; animated layout
properties; a parent's variable driving a child's transform; no reduced-motion handling on movement;
ungated hover motion; symmetric press-and-release; everything entering at once where a stagger
belongs.

## Fix in this order

1. Delete the animation (high frequency, no purpose, keyboard-triggered). 2. Reduce it: shorter,
smaller, fewer properties. 3. Fix the easing. 4. Fix origin and physicality. 5. Make it
interruptible. 6. Move it to cheap properties. 7. Make the timing asymmetric. 8. Polish: blur,
stagger, a spring for "alive". 9. Reduced motion, hover gating, cohesion.

## Say it in the reply

Two parts, in this order. First one markdown table, one row per issue, never a Before/After list:

| Before | After | Why |
| --- | --- | --- |
| a 300 ms transition on every property | transform only, 200 ms ease-out | name the properties; `all` animates what nobody meant |
| `ease-in` on a dropdown | strong ease-out | ease-in delays the moment watched |

Second the verdict, grouped by tier and highest first, empty tiers omitted: feel-breaking
regressions, missed simplifications, performance, interruptibility and timing, origin and cohesion,
accessibility. Close with Block (a feel-breaking regression, an animation on a keyboard or 100+/day
action, a scale from zero or ease-in on UI, a layout property with an easy transform fix) or Approve
(none of those, values inside bounds, interruption and reduced motion handled). Cite `file:line`.
When feel cannot be judged from code, say so and name the check: slow motion with the duration
raised to 2 to 5 times, frame by frame, a real device for gestures, fresh eyes the next day.

How each rule is written and read on a stack is its family: desktop (desktop-ui, qml-ui),
terminal (cli-ui, tui-ui), web (css-ui, react-ui, web-motion).

Adapted from skills/review-animations/SKILL.md and STANDARDS.md in github.com/emilkowalski/skills,
MIT licence, Emil Kowalski.
