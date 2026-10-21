---
name: ui-audit
description: "Use when asked to audit, review, or measure the static visual design of a UI: a desktop shell, panel, web page, or any screen with a screenshot or live geometry. Triggers: audit this UI, review this screenshot, check the spacing, are the radii consistent, why does this look off, check the contrast, is this aligned, separators vanish in dark mode, does it match the theme, popup under my dock, zkontroluj vizual, zmer mezery. Static visuals only: layout, spacing, geometry, colour, type, icons, elevation, theme and monitor parity. Motion is review-animations; feedback and flows are ux-audit; keyboard, focus and screen reader are a11y-audit."
---

# UI Audit

A screen that is looked at produces an opinion; a screen that is measured produces a finding. This
skill serves the person who builds and publishes a UI and wants to settle a design argument with a
number, so no finding goes in without one, and the number comes from a place the reader can check.
"The gap looks like about 170px" and "the contrast is low" are plausible, uncheckable, and about
half wrong. It audits static visuals only and does not fix the UI. Motion is review-animations.
Accessibility criteria are a11y-audit's; run it for this surface. How to create the design source is
ui-design, and how to expose a UI on one stack is that stack skill.

## Collect three channels before judging

1. **The capture.** `qsm-uix screenshot --out shot.png` takes the focused monitor, `--output <name>`
   a named one. Judge no detail from the full frame: crop and magnify with
   `qsm-uix crop shot.png --rect X,Y,W,H --zoom 6 --out zoom.png`. The zoom uses a point filter, so
   a soft edge in it is a soft edge on screen.
2. **Live geometry.** An introspection surface that reports each item's real x, y, width, height
   (item tree, DOM, accessibility tree). Dump it before measuring any gap by eye. The stack skill
   says how to expose it. If none is reachable, say so in those words and file every geometry claim
   as a hypothesis, because a gap counted off a screenshot measures the image, not the layout.
3. **The design source.** The written spec the UI is audited against: its tokens, pairs, scales. The
   expected column cites it, never taste. It is `design/MASTER.md` with `design/pages/<surface>.md`
   overriding it, so a page that differs from the master is no conflict. With none, derive the
   system from the measurements ("9 of 11 gaps are 12px"), say so, and file the deviators against
   it.

Drive the UI into every surface and state (each popout, panel, overlay) and capture each; one
resting frame is not an audit.

## The passes

1. **Structure and grouping.** Elements meant to share an axis match within 1px, read from the
   tree. Where spacing carries grouping, related items sit closer than separate groups
   (NN/g's proximity principle); measure against the design source, not a universal ratio.
   Derive the container rule in one sentence ("interactive elements get a
   capsule, readouts stay bare") and file what breaks it. A glyph with its weight off-centre, a
   play triangle or power mark, wants optical centring when the zoom shows the imbalance.
2. **Spacing rhythm.** Take every horizontal and vertical gap from the tree, no sampling, and
   cluster them against the design source's spacing tokens and documented exceptions.
   Report the clusters and each outlier beside its neighbours. Paired margins and paddings on one
   axis match within 1px unless the source declares otherwise. Check empty runs against the source's
   layout intent; size alone is not a defect without a broken relationship or source constraint.
3. **Geometry detail.** Every radius and border width comes from the token set or is a finding.
   Nested rounded containers follow inner radius about equal to outer radius minus the inset,
   because equal radii on nested corners read as a seam. Zoom each edge at 4x to 8x: a 1px smear
   on a crisp edge is a non-integer position, which the tree confirms as a fractional x or y.
   Sample a suspected fringe with `qsm-uix pixel-sample`; a hue belonging to neither foreground nor
   background is real. Sample a gradient or glow edge on all four sides, at each corner and on an
   open surface's corners, at the same distance from the edge: slight full colour at the edge
   fading inward evenly, and any difference is a finding.
4. **Colour and contrast.** `qsm-uix region-stats shot.png --rect X,Y,W,H --top 8` gives dominant
   colours with shares and each one's OKLCH l, c, h, which the hue and neutral-chroma checks read;
   every observed colour traces to a token, orphans are findings. Measure each on-pair, the fill and
   the token that sits on it, with `qsm-uix contrast shot.png --fg X,Y --bg X,Y`: 4.5 for body text,
   3 for large text and essential glyphs (WCAG 2.2, 1.4.3). Non-text parts need 3 against what they
   sit on (1.4.11): control borders, dividers that carry meaning, icons, data marks. A deliberately
   dim resting state passes only if its active state is captured and measured too. Sample the
   rendered pixel, never the colour the code names, because opacity stacks and blending change what
   reaches the screen. One hue is a finding too: take each role's top colour from `region-stats` on
   a rect of that role (when it covers over half the pixels, else Not examined), and when the
   neutrals carry chroma above 0.02 and the accent sits within 15 degrees of them in hue, file the
   palette once, because an accent that differs from its ground only by lightness marks nothing.
   The 0.02 and the 15 degrees are this repo's own thresholds, not from a standard, and the design
   source's own values win.
5. **Type and icons.** Inventory every text item with family, rendered size, weight. Sizes form a
   scale defined in the design source, not an imposed ratio. Rank items by size, weight, and
   contrast; the most glance-critical readouts belong at the top. Text in a row shares a baseline
   within 1px. Icons in one cluster share a bounding size within 1px and an optical weight (a
   hairline icon among filled ones is a finding).
6. **Token sets.** Elevation, layer (z-order) and icon size are sets of a few named values, like
   spacing. Collect each observed shadow, stacking order and icon box from the tree and capture;
   a value outside the set is a finding, and two overlays whose order contradicts the layer scale
   are one finding with both ids. Skip a set the design source does not define and list it under
   Not examined.
7. **Theme and variant parity.** Capture every theme (light, dark, high contrast) and every other
   variant the UI renders in (scale factor, density, locale) and run passes 1 to 6 on each,
   against that theme's own column of the source. Dark is designed, not inverted, so a value
   passing in light says nothing about dark. A border, divider, or state visible in one theme and
   gone in the other is a parity finding with the ratio in both. Compare inventory, spacing and
   palette per variant after normalising by scale factor.
8. **Reserved space and monitors.** A bar, dock, or sticky element owns reserved space that content
   must not run under. Read the owner's geometry and the content's geometry from the tree and
   file any overlap as a number of pixels. A shell claiming an edge lands flush on every output,
   so expect a zero gap at each. Capture every output, because the focused one alone is a coverage
   gap; toggle a per-screen state on one output and capture the other, since state must not leak.
9. **Polish.** Reasons are ui-design's. Hold each pressable down and capture it:
   - A pressed state exists and differs from rest: same bounds in the tree, or scaled to 0.95 to
     0.98 of them, with a measured pixel difference.
   - Hover, focus and disabled keep the box: the neighbours' x, y, width, height are unchanged
     in the tree.
   - A popover's anchor edge sits on its trigger, and a modal is centred in the viewport.
   - Every control with a pressed state in one theme has it in the other.
   - A raised surface has a soft shadow and no opaque border (ui-design); a solid border under a
     shadow is a finding.
   - In a dark theme an overlay has the 1 px low-alpha light edge besides its shadow, and the
     edge is not opaque (ui-design).

## The findings table

| id | pass | element | evidence (measured) | expected (source) | actual | severity |

Severity is `blocker`, `major`, `minor`, or `polish`. Evidence is a number from channel 1 or 2,
expected cites channel 3. A rule taken from a standard names it (`1.4.11`); a maintainer threshold
needs no citation. Check each row with a zoom crop of that exact region. Two design sources from
different owners that disagree are one finding citing both, tagged `source-conflict`, because which
wins is the owner's ruling. Under the table: **Hypotheses** (observed, not measured, never mixed
into the table) and **Not examined** (states, themes, screens, passes skipped, and why), so the
reader does not assume there were no gaps.

## Red flags

- When a row says "roughly", "about", or "appears to be", measure it or move it to Hypotheses,
  because a row the reader cannot check is an opinion.
- When a contrast claim has no ratio or a spacing claim no arithmetic from the tree, get the
  number, because those are the claims that turn out wrong.
- When you are judging from the full-resolution screenshot, crop and zoom first, because the eye
  misreads a downscaled edge.
- When you have one frame of a surface that has states or themes, capture each, because a resting
  light frame hides most defects.
- When you are about to rule on focus, keyboard, labels, colour-only meaning or reduced motion,
  stop and say accessibility criteria are a11y-audit's, because its method and the criterion list
  decide those, not a screenshot.
- When you are about to describe how something moves, hand it to review-animations, because this
  skill has no motion method.

## Say it in the reply

The table, then Hypotheses and Not examined, then one line naming which evidence channels and
which themes were available. Missing live geometry goes first: it changes how every row reads.

How each rule is built and exposed on a stack is its family: desktop (desktop-ui, qml-ui),
terminal (cli-ui, tui-ui), web (css-ui, react-ui, web-motion).

Source: the polish rules of emil-design-eng and the README in github.com/emilkowalski/skills (MIT,
Emil Kowalski). Grouping:
[NN/g, Proximity Principle in Visual Design](https://www.nngroup.com/articles/gestalt-proximity/).
Scale selection is ui-design's; the audit checks the adopted product scale.
