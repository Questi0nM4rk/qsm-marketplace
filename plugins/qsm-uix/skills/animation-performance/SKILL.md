---
name: animation-performance
description: "Use when an animation is janky, choppy, stutters or drops frames, when choosing which property to animate on performance grounds, when choosing declarative over script-driven motion, or when reaching for a GPU layer. Triggers: animation is janky, stutters, drops frames, laggy drag, choppy shadow, blur is slow, why is my popout laggy, animace seka, trha to. Finds the cause before changing code. Easing, duration and whether to animate are animate; judging motion as a whole is review-animations; writing the fix in a stack is its family skill."
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
2. Name the cause before changing code. "Promoted a layer, seems smoother" is not a diagnosis.
3. Never conclude "it is fine" from a fast machine. Say which findings come from code and which need
   a recording on a real device.
4. Never a catch-all transition, because it animates whatever changes next, layout properties
   included.
5. Which property you animate is yours to control; hardware acceleration is something the platform
   may grant. Spend the effort on the first.

## Symptom to fix

| Symptom | Fix |
| --- | --- |
| Stutters | animate `transform` and `opacity`, not size, margin or position |
| Shadow animation choppy | animate a cheaper shadow form, or fade a prepared one |
| Janks only during navigation or loading | move it off the thread that is busy then |
| A shorthand drops frames on a busy thread | write the full transform on the element |
| Hand-rolled animation drops frames | no state per frame: write the value, not a re-render |
| Drag gets laggier as the list grows | stop animating an inherited value; set it on the element |
| Blur transition lags | keep animated blur under 20 px (2 to 5 px softens a crossfade) |
| Unexpected properties animate | name the properties instead of a catch-all |
| 1 px shift when motion starts or ends | promote the element to its own layer, only once you see it |

## The budget

60 fps gives 16.7 ms a frame, 120 Hz gives 8 ms: design against the smaller. A layout pass on a
complex page can take over 100 ms, which is a dozen missed frames, not one. Two things decide it:
what you animate (work per frame) and where it runs (whether other work can block it).

**What you animate.** Layout, then paint, then composite; the cost differs by an order of magnitude.

| Tier | Properties |
| --- | --- |
| Composite only, cheapest | transform, opacity, and where the engine supports it filter, clip and background colour |
| Paint and composite | shadow, corner radius, text colour |
| Layout, paint and composite | size, padding, margin, position, border width |

Swap down a tier: a scale instead of a size; a translate instead of a position or margin; opacity
instead of display or visibility; a drop shadow instead of a box shadow.
A padding animation and a scale look the same and only one cannot regress on a slow device. Layout
properties also move the wrong things: animating a sidebar's `margin-left` re-lays-out the page
beside it every frame, `translateX` does not.

**Where it runs.** Motion driven by script on the main thread competes with everything else and its
frame is late when the thread is busy; declarative motion the platform can hand to the compositor
or render thread stays smooth whatever the script does. Watch for motion that plays while the app
does heavy work (a page transition, a tab indicator during navigation, anything beside fetching
or loading): a tab indicator animated by script dropped frames at the moment the next page loaded,
and moving it to declarative motion fixed it. Acceleration is progressive enhancement: percentage
transforms are the right call for unknown sizes even where an engine declines to accelerate them,
because correctness beats a best-effort optimisation.

## Three traps that look correct

- **State per frame.** A state update on every animation frame, pointer move, scroll or drag
  re-renders every 16.7 ms and the render alone blows the budget. Write the value to the element,
  or use a motion value.
- **Inherited variables.** A drag distance written to a variable that a child's transform reads
  recalculates styles for every descendant each frame; a drawer lagged past about 20 items with
  no re-render at all. Set the transform on the element itself.
- **Blur.** Animated `blur()` gets expensive fast; under 20 px.

**Layer promotion** (a hint that gives the element its own layer) costs GPU memory per layer and
engines already promote what animates `transform` or `opacity`. Add it only after you see the
shift or measured dropped frames, on the element that animates, never on a container.

**Script animation is allowed.** Main-thread motion only suffers when the app is busy during it.
The split: declarative motion for simple motion and anything that plays while the app is busy; a
library for complex, interruptible, gesture-driven motion (springs, layout and exit animations,
momentum).

## Workflow

1. **Find what animates**: a table of element, driver, properties, plays during. Expand
   catch-all transitions and shorthands into what they really animate.
2. **Diagnose**, in the order each is usually the cause: which properties (layout first, then
   shadow and corner radius, easy to miss); does the jank coincide with a busy page; is the UI
   re-rendering per frame; does it worsen as content grows; is an inherited value animated at all;
   blur over 20 px; and last, layer promotion. Confirm with a recording, not by feel: the
   profiler's frame view for dropped frames and long tasks, the animation inspector to slow it.
   Profile on
   a real mid-range device; CPU throttling on a desktop models a slow CPU, not a weak GPU.
3. **Report** each finding as element and `file:line`, cause, before, after, and verified (from code
   or needs a device recording), ordered by cost, layout before paint, busy thread before idle. Then
   stop; fixes are applied when asked.

## Say it in the reply

The animation table, then one block per finding as in step 3, closing with what was verified from
code and what still needs a recording on a real device.

How each fix is written and measured on a stack is its family: desktop (desktop-ui, qml-ui),
terminal (cli-ui, tui-ui), web (css-ui, react-ui, web-motion).

Adapted from skills/animation-performance/SKILL.md in github.com/emilkowalski/skills, MIT licence,
Emil Kowalski.
