---
name: css-ui
description: "Use when writing or fixing plain CSS and HTML for a page or component, or wiring Tailwind to a set of colours. Triggers: write the CSS for, style this card, dark theme, dark mode, hover animation, sticky header covers content, layout shifts, no framework, vanilla CSS, container query, Tailwind colours consistent, Tailwind theme config, napis CSS, tmavy rezim, stylovani. Builds the design source in CSS; how to audit it is ui-audit, why the values are what they are is ui-design."
---

# CSS UI

Hand-written CSS drifts the same way every time: a hex in a component, a dark theme that is
the light one inverted, a hover that nudges the layout, an animation that ignores the user's
motion setting. This skill is for the person who ships web UI and answers for its accessibility.
Its outcome is CSS where every value traces to a token, both themes are checked, and the
page is plain semantic HTML first. Out of scope: choosing the token values (ui-design: the
design source is the expected column), measuring the result (ui-audit), criteria and law
(a11y-audit, a11y-conformance), motion judgement (review-animations), React (react-ui).

## Rules

1. **Semantic HTML before any class.** `button`, `a`, `label`, `dialog`, `details`, `nav`, `main`,
   a real heading order. Reason: role, name, keyboard and focus then come free; a `div` with a
   click handler needs all four rebuilt by hand and one is always missed.
2. **Tokens are custom properties on `:root`, nothing else holds a literal.** Fills come as
   `--primary` plus `--on-primary`, and a component uses the pair together, never one half with a
   hand-picked partner. Reason: contrast is checked on the pair in each theme, so only a pair
   can be proven. Scales (space, type, radius, layer, duration, easing) are tokens too; a
   `z-index: 9999` or `200ms` in a component is a literal and a finding.
3. **Each theme is its own block, designed, not derived.** Light values in `:root`, dark values
   in `@media (prefers-color-scheme: dark) { :root { ... } }` with the same token names. Add
   `color-scheme: light dark` so form controls and scrollbars follow. Borders, dividers and
   hover states are re-checked in dark: a `1px` line that reads in light is often invisible on a
   dark fill (non-text contrast 3:1, WCAG 1.4.11). If the page also offers a manual toggle,
   put the same values under `:root[data-theme="dark"]` and keep one source of the values.
4. **Focus is `:focus-visible`, never `outline: none` alone.** Ring of 2 px or more, 3:1
   against the adjacent colours, `outline-offset` so it clears the border. Reason: removing the
   outline without replacing it is the commonest keyboard lock-out, and `:focus-visible`
   keeps the ring off mouse clicks.
5. **No state changes layout bounds.** A press is `transform: scale()` on `:active` (animate owns
   it); hover, focus and disabled change colour, opacity or shadow. No border that goes from 1 px
   to 2 px, no added padding or font-weight: reserve the space (`outline`, `box-shadow`, or a
   transparent border of the final width). Reason: bounds that move make the pointer leave the
   target and flicker.
   Adjacent states differ by a contrast ratio of 1.2 or more.
6. **Targets are at least 24 px, 32 px when frequent.** `min-block-size` and `min-inline-size`
   on the control, padding for the rest; a 16 px icon button gets padding, not a bigger icon.
7. **Motion comes from tokens, and gentles on request.** Easing and duration are custom
   properties, and `@media (prefers-reduced-motion: reduce)` sets the movement durations on
   `:root` to `0.01ms`, so one switch covers every component. Reason: a per-component override is
   forgotten in the next component. Curves, `@starting-style`, hover gating and the rest are
   web-motion's.
8. **Layout does not shift.** `aspect-ratio` or `width`/`height` on images and embeds, a
   reserved block for async content, `font-display: swap` with a metric-matched fallback
   (`size-adjust`), and the critical font preloaded. Below-fold images get `loading="lazy"`, the
   hero `fetchpriority="high"`; a video replaces an animated GIF.
   Reason: a late image pushing a button under the pointer is a mis-click.
9. **Size by the container and the content.** `min()`, `max()`, `clamp()` for fluid type and
   width; `@container` (set `container-type: inline-size`) so a card adapts to its slot, not
   the viewport; `min-height: 100dvh` for full height on mobile, not `100vh`. `dvh` follows
   the browser bars, so do not drive layout that must not jump while scrolling from it.
   Long user text: `overflow-wrap: anywhere` on a shrinkable flex or grid child, never
   `word-break: break-all` on prose. Numbers in columns: `font-variant-numeric: tabular-nums`.
10. **A sticky or fixed bar reserves its space.** `scroll-padding-top` equal to the header
    height (so anchors and focused fields are not hidden under it), `padding-bottom` for a fixed
    footer, `env(safe-area-inset-*)` on notch devices. Reason: a focused control under a sticky
    header fails 2.4.11, and the user cannot see where they are.
11. **An icon stands alone only where everyone reads it the same** (close, play, volume), and it
    then has a tooltip and an `aria-label`; any other action gets a text label. Never icon and
    label on one button; an icon beside other text is `aria-hidden="true"`. Icon boxes are 12 px
    or more, text 10 px or more.
12. **Features: container queries, `dvh`, `:focus-visible`, `:has`, `color-scheme` are
    Baseline and safe to use; anything newer is checked on MDN before use**, and gets an
    `@supports` fallback. The page works without it.
13. **A surface that opens on hover is also reachable without hover.** It opens on entry, stays
    for 180 ms after the pointer leaves, and every action and fact in it is reachable by click
    and by keyboard: a `button` with `aria-expanded` (or `popovertarget`) toggles it, `Escape`
    closes it. Reason: touch and keyboard users never hover. `:focus-within` keeps a compound
    control open while focus is inside.
14. **A dark overlay carries a soft shadow and a light edge.** Menus, popovers and dialogs always
    get a layered shadow; in the dark theme also a `1px` low-alpha light border (never opaque),
    because a shadow vanishes on a dark fill.

## Libraries

Platform first: `dialog`, `popover`, `details`, `:has`, container queries and `color-scheme` need no
package. Tailwind v4 carries tokens as utilities (below); the library picks are pick-ui-library's.
No CSS-in-JS runtime for a static page. Touch and phone fixes (tap highlight, `dvh`, safe areas,
input zoom) are mobile-native; motion is animate and review-animations.

## Conventions

From the Vercel web interface guidelines, in our words:

- Modals and drawers get `overscroll-behavior: contain`, so the page behind does not scroll. A
  dark theme sets `color-scheme: dark` on `html`, a native `select` gets explicit `background-color`
  and `color`, and `theme-color` matches the page background.
- Increase contrast on `:hover`, `:active` and `:focus`, never lower it. Make focus rings clear
  sticky bars (rule 10), and keep a visible replacement for any removed outline.
- Layered shadows (an ambient one and a direct one), crisp edges from a semi-transparent border
  plus a shadow (rule 14), nested radii where the child is never larger than the parent, and
  borders and shadows tinted toward the background hue so greys do not look pasted on.
- Text: `text-wrap: balance` on headings, `…` not `...`, a non-breaking space inside `10 MB` and
  `⌘ K`, curly quotes, `scroll-margin-top` on headings, and a skip link.
- Content survives short, average and very long user text, and empty, sparse, dense and error states
  are designed; a skeleton mirrors the final content so nothing shifts.
- Brand names and code tokens get `translate="no"`; `user-scalable=no` and `maximum-scale=1` are
  never set, because they block zoom.
- If it looks clickable it is clickable; the label and its checkbox or radio share one hit target
  with no dead zone; a tooltip is the last resort after inline help.
- Verify at phone, laptop and ultra-wide widths (50% zoom simulates the last), and with CPU
  throttling before claiming performance.

## Materials

A translucent surface is a `backdrop-filter: blur()` with saturation on a semi-transparent fill,
designed solid first. `@media (prefers-reduced-transparency: reduce)` swaps in the solid fill and
drops the blur, `@media (prefers-contrast: more)` adds a border, and the text pair is measured
over the blur, not over the fill. Never stack a translucent surface on another. Press feedback
starts on `:active` (pointer-down), letter-spacing is in `em` per heading step, spacing in `rem`.

## Make it checkable

The audits measure what the page exposes. Give them three reads: the DOM dump
(`document.documentElement.outerHTML`), the accessibility-tree dump (role, name, state per node;
Playwright `page.accessibility.snapshot()` or the browser's accessibility pane), and
`getComputedStyle(el)` for colour, size and bounds per state. These are the introspection surface
for ui-audit and a11y-audit; a UI that cannot be read this way is reported as not measured.

## Tailwind

Tailwind is the same tokens in another syntax; it adds nothing to the discipline.

- Put tokens in `@theme` (v4) or `theme.extend` (v3) and nowhere else. Define the pair names
  (`--color-primary`, `--color-on-primary`) so `bg-primary text-on-primary` is the only way
  to colour a fill.
- For themes, define the values as plain custom properties flipped by the
  `prefers-color-scheme` block of rule 3, and reference them with `@theme inline { --color-canvas:
  var(--canvas) }`. Then no `dark:` variant is needed on each element; a component with a
  `dark:` colour is a second place the dark value lives.
- No arbitrary values (`bg-[#1a1a1a]`, `p-[13px]`, `duration-[240ms]`): they are literals. A
  missing step means a missing token; add it to the design source first.
- `motion-reduce:` and `focus-visible:` on every animation and every control, as rules 4 and 7.
- Build class names whole (`{ red: 'bg-red-500' }`), never `bg-${color}-500`: the scanner
  cannot see the second.

## Red flags

- A hex, `rgb()`, `ms`, or `z-index` number in a component rule: replace with a token, because
  the next theme or density change will miss it.
- `outline: none` or `outline: 0` with no `:focus-visible` rule: add the ring, because the
  keyboard user loses their place.
- A dark block that only swaps `#fff` and `#000`: design the values on their own, because
  inverted greys wash out and borders vanish.
- `transition: all`: name the properties, because layout properties will animate and shift.
- `100vh`, `position: fixed` header with no `scroll-padding`: fix per rules 9 and 10, because
  the mobile address bar and the sticky header both hide content.
- A hover that sets `width`, `border-width`, `margin`, `padding`, or `font-weight`: move to a
  non-layout property, because the target moves under the pointer.
- `<div onclick>` or `<span role="button">`: use `button`, because role, name and keyboard
  are then free.

## Say it in the reply

Start with which tokens exist and which were added, then the two themes and the pair
ratios you checked or could not measure (a measured number, or "not measured: no browser here";
ui-audit measures it). List the states and what bounds they hold. Say which rules from the
design source you could not apply because it was absent, and which you assumed. Never claim a
contrast ratio you did not compute.

Sources: vercel-labs/web-interface-guidelines (MIT); emilkowalski/skills (MIT), including its
apple-design distillation of Apple WWDC talks.
