---
name: animation-performance
description: "Use when an animation is janky, choppy, stutters or drops frames, when choosing which property to animate on performance grounds, when choosing CSS or WAAPI over JS animation, or when reaching for will-change or a GPU layer. Triggers: animation is janky, stutters, drops frames, laggy drag, choppy shadow, blur is slow, should I use will-change, why is my popout laggy, animace seka, trha to. Finds the cause before changing code. Easing, duration and whether to animate are animate; judging motion as a whole is review-animations."
---

# Animation Performance

Imagine Sonner at 30 fps: same easing, same durations, same code, and nobody would care.
Performance is not a polish pass after the motion is good; it is what lets good motion register at
all. This skill serves the person whose animation drops frames: the question is never "does it look
right" but "does each frame finish in time". The developer's own machine is the least
representative device the animation will run on, so the bar is a mid-range device, and a 120 Hz
screen halves the budget. It does not pick curves or judge whether the motion should exist.

## Hard rules

1. `transform` and `opacity` by default; anything else needs a reason. If a cheaper property gives
   the same picture, use it even when the expensive one "seems fine".
2. Name the cause before changing code. "Added `will-change`, seems smoother" is not a diagnosis.
3. Never conclude "it is fine" from a fast machine. Say which findings come from code and which need
   a recording on a real device.
4. Never `transition: all`: it animates whatever changes next, layout properties included.
5. Which property you animate is yours to control; hardware acceleration is something the platform
   may grant. Spend the effort on the first.

## Symptom to fix

| Symptom | Fix |
| --- | --- |
| Stutters | animate `transform` and `opacity`, not `width`, `height`, `top`, `margin` |
| Shadow animation choppy | `filter: drop-shadow()` instead of `box-shadow` |
| Janks only during navigation or loading | move it to CSS or WAAPI, off the main thread |
| Motion `x`/`y` drops frames | animate the full `transform` string |
| Hand-rolled animation drops frames in React | write `ref.current.style`, not state |
| Drag gets laggier as the list grows | stop animating an inherited CSS variable; set `transform` on the element |
| Blur transition lags (Safari worst) | keep animated `blur()` under 20 px (2 to 5 px softens a crossfade) |
| Unexpected properties animate | replace `transition: all` with named properties |
| 1 px shift when motion starts or ends | `will-change: transform`, only once you see it |

## The budget

60 fps gives 16.7 ms a frame, 120 Hz gives 8 ms: design against the smaller. A layout pass on a
complex page can take over 100 ms, which is a dozen missed frames, not one. Two things decide it:
what you animate (work per frame) and where it runs (whether other work can block it).

**What you animate.** Layout, then paint, then composite; the cost differs by an order of magnitude.

| Tier | Properties |
| --- | --- |
| Composite only, cheapest | `transform`, `opacity`, and in current Chrome/Firefox also `filter`, `clip-path`, `background-color` (gaining support) |
| Paint and composite | `box-shadow`, `border-radius`, `color` |
| Layout, paint and composite | `width`, `height`, `padding`, `margin`, `top`, `left`, `border-width` |

Swap down a tier: `scale()` instead of `width` or `height`; `translate()` instead of `top`, `left`
or `margin`; `opacity` instead of `display` or `visibility`; `drop-shadow` instead of `box-shadow`.
A padding animation and a scale look the same and only one cannot regress on a slow device. Layout
properties also move the wrong things: animating a sidebar's `margin-left` re-lays-out the page
beside it every frame, `translateX` does not.

**Where it runs.** JS runs on the main thread: a `requestAnimationFrame` animation (GSAP, Motion
components) competes with everything else and its frame is late when the thread is busy. WAAPI and
CSS transitions and keyframes can be hardware-accelerated and stay smooth whatever JS is doing.
Watch for motion that plays while the page does heavy work (page transitions, a tab indicator during
navigation, anything beside fetching or hydration): Vercel's dashboard animated its active tab
indicator with a Framer Motion shared layout animation, the browser was loading the next page at
exactly that moment, so it dropped frames, and moving it to a CSS animation fixed it. Acceleration
is progressive enhancement: percentage transforms are the right call for unknown sizes even where an
engine declines to accelerate them, because correctness beats a best-effort optimisation.

## Three traps that look correct

- **State per frame.** `setState` in rAF, pointer-move, scroll or drag re-renders every 16.7 ms and
  the render alone blows the budget. Write `ref.current.style.transform`, or a motion value.
- **Inherited variables.** A drag distance written to a CSS variable that `translateY()` reads
  recalculates styles for every descendant each frame; Vaul's drag lagged past about 20 items with
  no re-render at all. Set `transform` on the element itself. Motion's `x`, `y`, `scale` shorthands
  use variables, hence not accelerated; keep them by default, use `transform: "translateX(100px)"`
  when the animation must survive a busy thread.
- **Blur.** Animated `blur()` gets expensive fast; under 20 px.

**`will-change`** promotes an element up front so no CPU-to-GPU hand-off shifts it by a pixel. Add
it only after you see the shift or measured dropped frames: engines already promote what animates
`transform` or `opacity`, and every promoted layer costs GPU memory. Put it on the element that
animates, never on `*` or a large container; it earns its place on an expensive paint such as a
large blurred element, kept small.

**JS animation is allowed.** Main-thread motion only suffers when the page is busy during it. The
split: CSS for simple motion and anything that plays while the page is busy; a library for complex,
interruptible, gesture-driven motion (springs, layout and exit animations, momentum).

## Workflow

1. **Find what animates**: a table of element, driver, properties, plays during. Expand
   `transition: all` and shorthands into what they really animate.
2. **Diagnose**, in the order each is usually the cause: which properties (layout first, then
   `box-shadow` and `border-radius`, easy to miss); does the jank coincide with a busy page; is
   React re-rendering per frame; does it worsen as content grows; is a CSS variable animated at all;
   blur over 20 px; and last, `will-change: transform`. Confirm with a recording, not by feel: the
   Performance panel for dropped frames and long tasks, the Animations panel to slow it. Profile on
   a real mid-range device; CPU throttling on a desktop models a slow CPU, not a weak GPU.
3. **Report** each finding as element and `file:line`, cause, before, after, and verified (from code
   or needs a device recording), ordered by cost, layout before paint, busy thread before idle. Then
   stop; fixes are applied when asked.

## On each stack

**Quickshell QML.** The same budget, a different pipeline: the scene graph renders on its own
thread, and the GUI thread runs the bindings.

- Animate `opacity`, `scale`, `x`, `y`, `rotation`. Animating `width` or `height` re-lays-out
  children and re-rasterises text, the layout tier.
- The animator types (`OpacityAnimator`, `ScaleAnimator`, `XAnimator`, `YAnimator`,
  `RotationAnimator`) run on the render thread, the counterpart of a CSS animation under load; a
  plain `NumberAnimation` runs on the GUI thread like rAF. Use an animator for motion that plays
  while the shell is busy.
- A binding re-evaluated every frame (a `Behavior` on a property that many children bind to) is the
  inherited-variable trap; animate the one item and let children be positioned relative to it.
- `layer.enabled: true` is the `will-change` analogue: it caches an item as a texture and costs GPU
  memory; add it only to an expensive item (a shadow, an effect) once measured. A `MultiEffect` blur
  or `DropShadow` animating every frame is the blur and box-shadow case.
- Confirm with a frame counter: `QSG_RENDER_TIMING=1` prints per-frame render timing, and
  `QSG_VISUALIZE=overdraw` shows paint cost. State which were run; a QML claim from code alone is
  "from code".

**Hyprland.** The compositor animates windows, layers and workspaces on its own render loop, so an
`hl.animation` leaf costs frames only through the surface it animates, not through the shell's code.
Cost scales with window size and monitor refresh; a long `workspaces` slide across a large
high-refresh monitor is where it shows. Read the refresh rate from `hyprctl monitors`;
`hl.config({ animations = { enabled = false } })` is the quick test of whether an
animation is the cause.

**CSS and React.** Everything above, as written.

**TUI.** Frame budget does not apply as such: the cost is bytes written per redraw. Redraw only
what changed, cap spinner updates to a steady interval, never redraw when output is not a TTY.

## Say it in the reply

The animation table, then one block per finding as in step 3, closing with what was verified from
code and what still needs a recording on a real device.

Adapted from skills/animation-performance/SKILL.md in github.com/emilkowalski/skills, MIT licence,
Emil Kowalski.
