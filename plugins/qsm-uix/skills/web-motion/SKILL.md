---
name: web-motion
description: "Use when motion on a web page is written, judged, surveyed or debugged in CSS, WAAPI or React: the transition or keyframes for a dropdown, modal, toast or press, a reduced-motion block, a Motion or Framer Motion component, a CSS animation that drops frames on a busy page, or a grep sweep of a web codebase for bad easing. Triggers: CSS transition for a modal, @starting-style, prefers-reduced-motion block, CSS hover gating, WAAPI element.animate, Framer Motion x vs transform, web animation janks while the page loads, CSS will-change, CSS transition all, CSS ease-in on a dropdown, animace v CSS, plynuly prechod na webu. Web form only: whether and which curve is animate, judging is review-animations, QML and Hyprland are qml-ui and desktop-ui."
---

# Web Motion

animate, review-animations, improve-animations, find-animation-opportunities and
animation-performance hold the values and the judgement; this skill holds how they are written on
a web page, for the person who ships it. A model left alone writes `transition: all 300ms`,
`ease-in`, a hover effect that fires on touch and no reduced-motion block. The outcome is motion
whose curves are tokens, whose properties are compositor-only, that survives a second click and a
busy thread, and that the reviewer passes on the first read. The numbers (curves, durations,
scales) are animate's tables; here are only the three curves and the CSS forms of its rules.

## Write it

1. **Curves are custom properties, never the keywords,** except animate's named exceptions (`ease`
   for a colour change on hover, and for the toast; a hover that moves uses ease-out). `--ease-out:
   cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`,
   `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`. Durations are the design source's tokens,
   movement (`--dur-move-<name>`) separate from opacity and colour (`--dur-fade-<name>`). Reason:
   the built-in `ease-out` is too weak to feel deliberate, and one token is one place to fix.
2. **Name the properties and keep to `transform` and `opacity`.**
   `transition: opacity var(--dur-fade-<name>) var(--ease-out), transform
   var(--dur-move-<name>) var(--ease-out)`, never `all`. Reason: `all` animates whatever someone
   adds later, layout properties included. The whitelist (`clip-path`, `height` on an accordion)
   is animate's; `height` is never animated to `auto`.
3. **Origin is where the thing comes from.** `transform-origin` at the trigger for a popover,
   dropdown, menu or tooltip; a modal stays centred. An SVG transform goes on a `<g>` with
   `transform-box: fill-box; transform-origin: center`, because without the box the origin is the
   viewport corner.
4. **Entry on mount is `@starting-style`**, from the start scale animate gives that element and
   `opacity: 0`, never from `scale(0)`. Reason: nothing real appears from nothing, and
   `@starting-style` needs no mounted flag in script. A drawer or toast starts from
   `translateY(100%)` (a percentage is of the element's own height); the stagger offset is
   animate's.
5. **Press is `:active { transform: scale(<animate's press scale>) }`**, ungated: `:active` is a
   real press. **Hover motion is gated** by `@media (hover: hover) and (pointer: fine)`, the CSS
   form of ui-design's fine hovering pointer. Reason: a touch screen fires hover on tap and the
   effect sticks.
6. **Reduced motion ships with the animation.** `@media (prefers-reduced-motion: reduce)` uses
   css-ui rule 7's movement-duration tokens and keeps the opacity and colour changes that
   explain the change: gentler, not zero. A muted decorative loop stops under it. Vercel's README
   states the autoplay rule: motion that plays on its own for over 5 s beside other content has
   a pause, stop or hide control.
7. **Interruptible by default.** A transition retargets from the current value; a keyframe
   restarts from zero. Use transitions for anything the user can fire twice in a second (toast,
   toggle, menu); WAAPI (`element.animate()`) when script must control it with CSS performance;
   a keyframe only for predetermined motion that must stay smooth while the page is busy.
8. **The library choice is pick-ui-library's.** Its Motion component writes `animate={{ transform:
   "translateX(100px)" }}`, not `x: 100`, when the page is busy: Emil's cause is that the `x`,
   `y` and `scale` shorthands run on the main thread through `requestAnimationFrame` and drop
   frames under load. Reduced motion is
   `useReducedMotion()` or `MotionConfig reducedMotion="user"`.

## Keep it fast

- **Where it runs.** `requestAnimationFrame` animations (GSAP, Motion components) share the main
  thread and are late when it is busy; CSS transitions, keyframes and WAAPI can be accelerated
  and stay smooth. Motion that plays while the page loads or hydrates (a page transition, a tab
  indicator on navigation) goes to CSS, because that is the moment the thread is busiest.
- **No state per frame.** `setState` in rAF, pointer-move, scroll or drag re-renders every
  16.7 ms. Write `ref.current.style.transform` or a motion value.
- **No inherited variable for a drag.** A drag distance in a CSS variable that a child's
  `translateY()` reads recalculates every descendant each frame. Set `transform` on the element
  itself.
- **Tiers** are animation-performance's table. In CSS: `scale()` for a size and `translate()`
  for `top`, `left` or `margin`.
- **Blur under 20 px**; an animated `blur()` is expensive. The crossfade recipe is animate's.
- **Layer hints follow animation-performance's promotion rule.** The CSS form is
  `will-change: transform` on the measured element, never `*` or a container.
- **Recordings follow animation-performance's verification rule.** On the web, use the browser's
  Performance panel for dropped frames and long tasks, and the Animations panel for slow playback.

## Judge it: the web findings

Each is a finding in review-animations' tiers, with the fix beside it:

- `ease-in` or the built-in `ease-out` on UI: the three curves (`ease` only in the exceptions).
- `transition: all`, or a transition on `width`, `height`, `margin`, `top`, `left`: name
  `transform` and `opacity`.
- `scale(0)` entrance; centre origin on a trigger-anchored popover; a keyframe on a rapidly
  fired element.
- A duration literal in a component, or one over animate's cap with no reason.
- Hover motion outside the hover media query; movement with no reduced-motion block; a reduced
  variant that removes all feedback.
- A parent's variable driving a child's transform; Motion `x` or `y` on a page that is busy.
- `will-change` on a container or on everything.

## Survey it

Use improve-animations for the survey workflow and plan format. Web search terms: `transition`,
`animation`, `@keyframes`, `motion.`, `useSpring`,
`ease-in`, `transition: all`, `scale(0)`, `prefers-reduced-motion`, `transform-origin`,
`will-change`, `@starting-style`. A web plan includes the rewritten CSS or component line.

## Name it

The web words for the vocabulary: `transition`, `@keyframes` (the keyframes), WAAPI (`animate()`
on an element), Motion (the library), a view transition (the browser morphs between two states),
`transform-origin` (the origin), `@starting-style` (the mount state).

## Red flags

- When a hover rule has no media query, gate it, because the touch user gets a stuck state.
- When an animation is only checked by reading the code, say "from code" and name the recording
  that would prove it.
- When the answer to "should this animate" is no (a keyboard shortcut, 100+ times a day), write no
  CSS, because animate decides that first.

## Say it in the reply

The CSS or component, then the three lines animate asks for, and for a review the table of
Before, After, Why. Say which checks were from code and which from a recording.

Sources: emilkowalski/skills (MIT); vercel-labs/web-interface-guidelines (MIT).
