---
name: web-harness
description: "Use when break-ui or prototype is run on a web page or React app: the Demo data or Worst case toggle, a ?data=worst fixture switch, or the floating picker that flips between prototype variants in a browser. Triggers: worst-case data toggle in React, ?data=worst, variant switcher on a web page, /prototypes route, picker pill, data toggle v Reactu, prepinac variant. Web form only: what to feed and judge is break-ui, which variants to build is prototype, component CSS is css-ui."
---

# Web Harness

break-ui and prototype say what to do; this skill is the browser-side machinery, for the person who
runs them on a page or a React app. A stress test whose toggle is a custom form, or a prototype
whose picker is restyled to the project, measures the harness instead of the piece. The outcome is
a toggle or picker that is plain, dev-only, leaves the component untouched, and a break fixed by
the property the table names.

## The data toggle (break-ui)

A segmented control labelled Demo data / Worst case (plus Empty, One, 1,000 rows), fixed
bottom-centre, small, gray track and white pill, system font, no animation on the content. In a
project with a dev server: a `?data=worst` URL param read where the fixture is chosen, only behind
the build's dev flag (it survives reload), or a prototype route per fixture. No project: one
self-contained HTML file with the component and both datasets inline. Reason: the toggle swaps
data at the boundary; editing the component to get a break tests your edit.

## The prototype harness

In a project with a dev server, an isolated route (`/prototypes/<slug>`), one file per variant
plus a small harness; nothing in production imports from it. No project: one self-contained HTML
file. In a framework the picker is the same classes and structure with state instead of
`innerHTML` and a keyed re-mount.

## The picker

A floating dark pill, bottom-centre. Dark glass reads on any page, so it is not theme-aware.
Verbatim: no project fonts, brand colours, theme switching, extra shadows or borders.

```html
<nav class="proto-picker" aria-label="Prototype variants">
  <span class="proto-picker-highlight" aria-hidden="true"></span>
  <button class="proto-picker-item" data-active aria-current="true">Quiet</button>
  <button class="proto-picker-item">Editorial</button>
  <span class="proto-picker-divider" aria-hidden="true"></span>
  <button class="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)">↻</button>
</nav>
```

```css
.proto-picker { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  z-index: 2147483647; display: flex; align-items: center; gap: 2px; padding: 4px;
  border-radius: 999px; background: rgba(10,10,10,.82);
  backdrop-filter: blur(12px) saturate(1.4);
  box-shadow: 0 0 0 1px rgba(255,255,255,.08) inset, 0 8px 24px rgba(0,0,0,.24), 0 2px 6px rgba(0,0,0,.12);
  font: 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  user-select: none; }
.proto-picker-highlight { position: absolute; top: 4px; left: 0; width: 1px; height: 28px;
  transform-origin: left; border-radius: 999px; background: rgba(255,255,255,.12);
  will-change: transform; }
.proto-picker[data-ready] .proto-picker-highlight {
  transition: transform 250ms cubic-bezier(.23,1,.32,1); }
@media (prefers-reduced-motion: reduce) { .proto-picker[data-ready] .proto-picker-highlight { transition: none; } }
.proto-picker-item { position: relative; display: flex; align-items: center; height: 28px;
  padding: 0 12px; border: 0; border-radius: 999px; background: transparent;
  color: rgba(255,255,255,.55); font: inherit; cursor: pointer; transition: color 150ms ease; }
@media (hover: hover) and (pointer: fine) {
  .proto-picker-item:hover { color: rgba(255,255,255,.85); } }
.proto-picker-item:active { transform: scale(.97); }
.proto-picker-item:focus-visible { outline: 2px solid rgba(255,255,255,.4); outline-offset: 2px; }
.proto-picker-item[data-active] { color: #fff; }
.proto-picker-divider { width: 1px; height: 16px; margin: 0 4px; background: rgba(255,255,255,.12); }
.proto-picker-replay { padding: 0 10px; font-size: 14px; }
.proto-picker[data-position="top"] { bottom: auto; top: 24px; }
@media (prefers-reduced-transparency: reduce) {
  .proto-picker { background: rgb(10,10,10); backdrop-filter: none; } }
```

The highlight moves between items with `transform` only (`translateX` and `scaleX`, never `left` or
`width`); the variant swap stays instant. The picker is throwaway chrome and holds literals on
purpose: it is deleted when a variant is promoted. The one allowed change:
`data-position="top"` when a variant occupies the bottom-centre (toast stack, sheet, dock).
Render replay and its divider only when a variant has motion to re-trigger.

Behaviour: keys `1` to `N` and arrows switch, `R` replays, ignored in an input, textarea, select,
contenteditable or with a modifier held. Exactly one item carries `data-active` and
`aria-current="true"`. The choice persists in `?v=2`, default 1. `data-ready` is added after two
animation frames so load does not animate the highlight; set the highlight's `scaleX` and
`translateX` from the active item's `offsetWidth` and `offsetLeft`, again on resize. A switch
re-mounts the variant (clear, render next frame) so entrance animations re-run; replay re-mounts
without switching.

## Fixes for the web breaks

The fix names the property; the rules around it are css-ui's. Where the picker's own colours break
css-ui's token rule, that is intended: it is deleted when a variant is promoted. Its colour
change uses animate's `ease` exception for colour.

| What you see | Cause | Fix |
| --- | --- | --- |
| Avatar squished to an oval | flex child shrinking | `flex-shrink: 0` on fixed-size boxes |
| Text overflows its box | flex/grid child `min-width: auto` | `min-width: 0`, `minmax(0, 1fr)` |
| Email or URL runs past the edge | no break opportunity | `overflow-wrap: anywhere` |
| Trailing action pushed off or clipped | middle took all the space | `min-width: 0` middle, `flex-shrink: 0` action |
| Badge wraps to two lines | badge may shrink | `white-space: nowrap; flex-shrink: 0`, decide what yields |
| Avatar adrift beside a three-line name | rows of varying height centred | top-align once text can wrap |
| Last row cut mid-glyph | fixed height, no fade or scroll cue | visible scrollbar or fade mask |
| Heading breaks mid-word | `word-break: break-all` | `overflow-wrap: anywhere` |
| Wrong initials | `split(' ')[0][0]` | grapheme clusters (`Intl.Segmenter`), first plus last word, icon fallback |
| Emoji initial is half a character | `charAt(0)` cuts a surrogate pair | first grapheme via `Intl.Segmenter` |
| Typed text past the stored limit | `maxLength` and the schema disagree | one limit from the schema; feed limit + 1 |
| Orphan dash where a field was missing | placeholder for absent optional | omit the line or reserve its height |
| "1 members" | hardcoded plural | `Intl.PluralRules` |
| Digits jitter or misalign | proportional figures | `font-variant-numeric: tabular-nums` |
| `NaN`, `undefined`, raw `1284` | raw number | `Intl.NumberFormat`, guard null |
| Translated button overflows | fixed width | `min-width`, never fixed `width` |
| Tall scripts clipped | tight line height with `overflow: hidden` | looser line height |
| Broken-image icon | no error fallback | initials fallback, `object-fit: cover` |
| Truncated text nobody can read | ellipsis and nothing else | tooltip or `title`, full value in a detail view |
| 1,000 rows stutter | every row rendered | virtualize or paginate, say which |
| Raw `<b>` or `&amp;` shown | wrong escaping layer | escape once at render |

## Red flags

- When the picker takes the project's fonts or colours, revert it, because it must look the same on
  every page it is dropped into.
- When a toggle ships outside the dev flag, remove it, because worst-case data is not a feature.
- When a break was provoked by editing the markup, revert and change the data instead.

## Say it in the reply

Where the switcher runs (URL, file) and its keys, and for a break the property changed and the
value that showed it.

Sources: emilkowalski/skills (MIT); vercel-labs/web-interface-guidelines (MIT).
