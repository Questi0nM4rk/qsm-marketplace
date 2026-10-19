---
name: a11y-audit
description: "Use when asked whether a UI can be used without a mouse, with a screen reader, with larger text, with reduced motion, or without telling colours apart, or to check it before publishing. Triggers: keyboard only, tab order, focus visible, screen reader, accessible name, is this accessible, colour only, red text for errors, reduced motion, text scaling, WCAG check, a11y audit, pristupnost, dostupne jen z klavesnice. Fills a per-criterion conformance table from driving and reading the UI. Criterion levels and legal status are a11y-conformance; static visual measurement is ui-audit; motion is review-animations."
---

# A11y Audit

Whether someone can use a UI is decided by what the keyboard reaches, what the platform tree
announces, and what survives without colour, motion or default text size. A screenshot shows none of
that, so an unaided agent reads the code, says "looks accessible", and files nothing measured. This
skill serves the person who publishes interfaces and answers for their accessibility: it drives and
reads the UI, and fills a conformance table where every verdict has evidence or says it has none. It
does not judge static visuals (ui-audit), judge motion (review-animations), fix the UI (the stack
skills), or give legal advice. Criterion numbers, levels and legal status are in a11y-conformance.

## First line: what you can see

Name the evidence channels you have before any verdict: the platform accessibility tree, a way to
send keys (`wtype`, Wayland), captures (`qsm-uix screenshot`), the design source. A criterion that
needs a channel you lack is `not tested`, said up front, because a pass without the channel measures
nothing and `not tested` is the honest cell. Never write `pass` for what you only inferred from
code.

## Method

1. **Announce, then drive.** Keys are synthetic input; say which surfaces you will drive and do not
   send them while someone is working in the window. Focus the window first
   (`hyprctl dispatch focuswindow <selector>`), then `wtype -k Tab`,
   `wtype -M shift -k Tab -m shift`, `wtype -k Escape`. If `qsm-uix doctor` says `wtype` is missing,
   the keyboard path goes to Needs human trial with exact steps.
2. **Keyboard path.** From a fresh surface press Tab (Shift+Tab back) until focus repeats; record
   the stops in order. Check: the order follows the visual order (2.4.3), nothing reachable by
   pointer is missing from it (2.1.1), focus leaves every widget (2.1.2), Esc closes what opened.
   Every drag, swipe or hover-only action needs a button or key path (2.5.7, 2.1.1). Capture at each
   stop, so you see the indicator itself and not the claim that one exists. After each key,
   `qsm-uix a11y-tree <app>` shows which node carries `focused`: that is the stop, and the order of
   those nodes is the tab sequence.
3. **Focus indicator.** At each stop crop and zoom (`qsm-uix crop --zoom`) and sample indicator and
   neighbour with `qsm-uix pixel-sample`; the indicator needs 3:1 against adjacent colour (1.4.11).
   2.4.13 (indicator size and contrast) is AAA, so report it as practice. Capture the indicator in
   each theme yourself and file one row per theme; an indicator present in one theme only fails
   2.4.7 in the other.
4. **Not obscured.** With every sticky bar, dock, popup or banner showing, Tab to the last stops
   and check the focused item is not entirely hidden (2.4.11). A scroll container without reserved
   space is the usual cause; the geometry from the tree proves it.
5. **Name, role, state.** Read each interactive control from the accessibility tree: name (equals
   or contains the visible label, 2.5.3), role (a clickable rectangle that reports as generic is a
   fail of 4.1.2), state (checked, expanded, disabled, value). Decorative icons carry no name; an
   icon alone carries one; the same glyph beside text is decorative. How to read the tree:
   - Native toolkit on Linux: `qsm-uix a11y-tree <app-name> [--depth N] [--json]` prints
     each node as indent, role, name and `[focused,focusable,showing]` from AT-SPI; the default
     depth of 32 covers GTK4 apps, whose trees are deep. `qsm-uix doctor` says whether the bus
     answers; if it does not, name the doctor's remedy and mark tree-bound criteria `not tested`.
     Verified live against a GTK4 app (pavucontrol): the tree reads and Tab moves `focused`.
     A Qt or QML application (Quickshell included) is absent from the tree unless launched with
     `QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1` (verified with a `qml6` window: absent without it,
     present with it), so relaunch it with the variable before calling the tree unreachable.
   - Web: the browser's accessibility tree, not the DOM.
6. **Colour not the only carrier.** For each state shown by colour (error, selected, status, chart
   series) capture it, convert to grayscale (`magick in.png -colorspace Gray out.png`) and look: the
   state must still differ by text, icon, shape or pattern (1.4.1). Red text alone fails; red text
   plus a message and an icon passes. Contrast numbers for the text itself are ui-audit's.
7. **Text scaling and reduced motion.** Set the system text scale to 200 percent (1.4.4) and
   recapture every surface: clipped, overlapped or unreachable content is a finding, with the
   cropped capture as evidence. Set the system reduced-motion preference and trigger every animated
   surface: motion that still plays is a finding against the design source's own requirement, not a
   failed AA criterion (2.3.3 is AAA), and review-animations judges the timing, which ux-audit check
   7 measures on a running surface.
8. **Targets.** Take the measured hit areas from ux-audit check 3 (or the tree) and record only
   the 2.5.8 verdict with its exceptions from a11y-conformance.

## The conformance table

| criterion | verdict | evidence | surface |

One row per A and AA criterion that applies, in number order. Verdict is `pass`, `fail`,
`not applicable` or `not tested`. Evidence is a capture path, a tree dump line, a measured number
or the tab sequence; a `pass` row without evidence is not a pass. `not applicable` states why (no
video, so 1.2.x). Take the criterion list, levels and tests from a11y-conformance; do not
reconstruct them from memory. Under the table: **Hypotheses** (suspected, unmeasured), **Needs
human trial** (a real screen reader, a real keyboard session, assistive hardware: exact steps and
what counts as a pass), **Not examined** (surfaces and states not reached, and why).

A conformance table is a fact about the surfaces you drove. A UI with three untested surfaces
cannot be summed up as "conformant"; say which surfaces the table covers.

## Red flags

- When about to write `pass` from reading the code, drive it or read the tree, because code says
  what was meant and the tree says what a user gets.
- When the tree is unreachable, list every name, role and state row as `not tested` in the first
  line, because a silent gap looks like a clean result.
- When focus is invisible in a capture, check theme and pointer-versus-keyboard mode before filing,
  because many toolkits show the indicator only after a key press.
- When a control works by hover, drag or right click only, look for a key path before filing
  pass, because a pointer path alone fails 2.1.1.
- When you reach for legal wording (required, fined, covered), point to a11y-conformance, because
  level and law are decided there and nowhere else.
- When a finding rests on a screenshot of the resting state, drive the other states, because most
  keyboard and focus defects live in transitions.

## Say it in the reply

The evidence-channel line first, then the table with its three lists, then one sentence on which
surfaces were driven and which half of the criteria the tree could not test. Point the reader to
a11y-conformance for what each criterion means in law.
