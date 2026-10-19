---
name: mobile-native
description: "Use when a web app or PWA (browser, React, plain CSS) is built for or reviewed on a phone and something works in Chrome but feels wrong on the phone: sticky hover after a tap, gray tap flash, the 100vh bug, an input that zooms the page, laggy taps, pull-to-refresh hijacking scroll, content under the notch, long-press selecting button text, a carousel that scrolls the wrong way, a mismatched status bar. Triggers: feels like a website on my phone, make this web app feel native, bottom sheet on a web page, carousel on a web page, safe area, PWA, 100vh on mobile, tap highlight, vypada to jako web na mobilu. Web only: Quickshell, QML, Hyprland and terminal UI never load it. Motion is animate, plain CSS rules are css-ui."
---

# Feeling Native On Mobile

A web app on a phone gives itself away by a handful of platform-layer tells: viewport, touch,
scroll, safe areas, browser chrome. This skill removes them one by one for the person who ships web
UI to real phones. It does not design or review motion (animate, review-animations) and does not
cover React Native. Most "janky on mobile" reports are not animation problems: they
are a tap delay, a gray flash, or a hover that will not let go.

The phone is the source of truth. A desktop browser with the device toolbar on is not a phone, and
none of the bugs below reproduce there. When no hardware is at hand, say which fixes you verified
from code and which need a device.

## Hard rules

1. **Every fix ships with its reason.** Apply it where the reason applies, not out of habit:
   `user-select: none` on a button is correct, on body text it is a defect.
2. **Media queries over device sniffing.** `(hover: hover)`, `(pointer: fine)`, `env()`, `dvh`.
   Never branch on user agent or screen width to guess touch; JavaScript is the wrong tool when a
   declaration or a meta tag does it.
3. **Touch and mouse are not exclusive** (iPad trackpads, touch laptops). Gate by capability.
4. **Never disable zoom.** `user-scalable=no` and `maximum-scale=1` fail accessibility; fix the
   input font size that caused the zoom.
5. **Test on hardware before calling it done**, over the LAN IP, with Safari Web Inspector or
   `chrome://inspect`.

## Symptom table

| Problem | Solution |
| --- | --- |
| Hover stuck after tap | `@media (hover: hover) and (pointer: fine)` around every `:hover` |
| Gray or blue flash on tap | `-webkit-tap-highlight-color: transparent` once on `html`, then give every tappable its own `:active` |
| Wrong height | `100dvh` for an app shell, `min-height: 100svh` for a hero, never `100vh` (it is the largest viewport) |
| Page zooms into input | font size 16px minimum on `input, textarea, select` |
| Tap feels laggy | `touch-action: manipulation`; feedback on `:active` or `pointerdown`, not `click` |
| Pull-to-refresh hijacks scroll | `overscroll-behavior: none` on `html, body`, `contain` on inner scrollers |
| Content stops at the notch | `viewport-fit=cover` plus `env(safe-area-inset-*)` padding |
| Long-press selects button text | `user-select: none`, `-webkit-user-select: none`, `-webkit-touch-callout: none` on controls only |
| Carousel scrolls vertically | `touch-action: pan-y` on a horizontal gesture surface |
| Status bar colour wrong | one `theme-color` meta per `prefers-color-scheme` |
| Right in Chrome, wrong on phone | real hardware |

## The fixes

1. **Sticky hover.** Touch has no hover, so the browser fakes one that stays until the next tap.
   Both conditions matter: `(hover: hover)` says the primary input can hover, `(pointer: fine)`
   rules out styluses and Android devices that claim hover. Tailwind v4's `hover:` already compiles
   to the media query; v3 needs `future.hoverOnlyWhenSupported`. Touch users get press feedback
   from `:active`, which works on every input.
2. **Tap flash.** The highlight fights the press feedback you designed. Removing it removes the
   browser's only feedback, so every tappable needs its own `:active`.
3. **Height.** `dvh` follows the URL bar, right for a shell but it shifts marketing content
   mid-scroll; `svh` is stable and never overflows, right for a hero. `lvh` is the old `vh`: almost
   never wanted.
4. **Input zoom.** iOS zooms when focus lands on text under 16px and does not zoom back. To keep
   smaller desktop text, set 16px under `@media (pointer: coarse)`. Set the keyboard too:
   `inputmode="numeric"` or `"decimal"`, `type="email"` or `"tel"`, `autocapitalize="none"` and
   `autocorrect="off"` on usernames and codes, `enterkeyhint="send"`, `"search"` or `"done"`.
5. **Laggy tap.** Two causes stack: the double-tap-zoom wait (`touch-action: manipulation` makes
   `click` fire at once) and feedback on release instead of press. Keep press feedback at 100 to
   160ms, `ease-out`, using the codebase's animate tokens rather than a new curve:
   `.button:active { transform: scale(0.97) }`.
6. **Overscroll.** `none` on the root, `contain` on children (a sheet's content, a chat list): it
   keeps the container's bounce and stops the page behind it. Never `touchmove` plus
   `preventDefault()`: it blocks scrolling and makes the listener non-passive. Drop the root rule
   when pull-to-refresh is welcome on a scrolling document.
7. **Notch.** Meta `width=device-width, initial-scale=1, viewport-fit=cover`, then
   `padding-top: env(safe-area-inset-top)` on a fixed header, `padding-bottom:
   calc(1rem + env(safe-area-inset-bottom))` on a sheet or bottom bar. Without the meta tag every
   `env()` is `0px`; give `env()` a fallback inside a `calc`. Normal page content usually needs
   nothing.
8. **Long-press.** Controls (button, tab, chip, drag handle) are not selectable; content (addresses,
   error messages, order numbers) must stay selectable, so never `user-select: none` on `body`.
9. **Carousel.** The values name what the browser may still do: `pan-y` on a horizontal carousel
   keeps vertical scroll with the browser; `none` means the element owns every axis (a custom drag
   surface) and traps the user otherwise; `pan-x` on a vertical sheet handle. A native-scroll
   carousel prefers `scroll-snap-type: x mandatory` and `scroll-snap-align: start`: the browser's
   physics beat a hand-rolled spring.
10. **Status bar.**
    `<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">` and the dark
    twin, plus `<meta name="color-scheme" content="light dark">`. Match the colour at the very top
    of the page, not the brand colour. Next.js sets it through the `viewport` export; a class-based
    theme updates the tag from JavaScript on toggle; an installed PWA also needs the manifest
    `theme_color` and `background_color`.
11. **Hardware.** Sticky hover, tap highlight, URL bar effect on `vh`, input zoom, click delay,
    overscroll, safe areas and the software keyboard are real-device behaviours. Use a phone a few
    years old, with the keyboard open, once in landscape, and as an installed PWA when that is a
    target. The Xcode Simulator beats emulation but still misses touch feel.

## Baseline

The floor before the first component:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
```

```css
html { -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; overscroll-behavior: none; }
input, textarea, select { font-size: 16px; }
button, a, [role="button"] { touch-action: manipulation; user-select: none; -webkit-user-select: none; }
@media (hover: hover) and (pointer: fine) { /* all :hover rules live here */ }
```

`interactive-widget=resizes-content` makes the keyboard shrink the layout viewport on Android
Chrome, so `100dvh` and bottom-pinned inputs react as on iOS. Add the two `theme-color` metas of
fix 10.

## Never ship

| Never | Instead |
| --- | --- |
| `user-scalable=no`, `maximum-scale=1` | 16px inputs |
| ungated `:hover` | the hover and pointer media query |
| `100vh` for a shell or bottom-pinned UI | `100dvh` |
| `100dvh` on a hero | `100svh` |
| press feedback on `click` only | `:active` or `pointerdown` |
| `user-select: none` on `body` | controls only |
| `touch-action: none` on something the user must scroll past | `pan-x` or `pan-y` |
| `env(safe-area-inset-*)` without `viewport-fit=cover` | add the meta tag |
| one `theme-color` for both schemes | one per scheme |
| declaring it fixed from emulation | real hardware |

## Say it in the reply

At most a few lines: the symptom matched and its one-line reason; each change as file and
declaration; which fixes need a phone to confirm. The code is the deliverable, not a report.

Source: emilkowalski/skills mobile-native (MIT), condensed.
