# qsm-uix

Design a user interface from one written source, then check the running UI against it with
measurements, for the person who builds an interface and answers for its accessibility.

## Why it exists

A UI made by taste and judged by looking ships defects nobody measured, and some of them lock
people out entirely. qsm-uix exists so that an interface starts from one written design source
whose first constraint is that everyone can use it, and is then verified against that source by
measurement, for the person who builds and publishes interfaces and answers for their accessibility.
It takes the stance that a finding without a measurement is an opinion. It refuses to be a
catalogue of palettes and fonts, a generator that picks a look for a product, or a slide tool.
When designs carry their source and their numbers by default, this plugin can go.

## What you get

The general skills hold principles and values and name no stack syntax. Each family skill holds
its stack's syntax, libraries and design rules; a general skill ends by pointing to the families.

### General

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `ui-design` | Writes a stack-neutral design source: tokens, on-pairs, light and dark themes, a style with its accessibility rules |
| Skill | `apple-design` | Apple's interface foundations: response, materials and depth, typography, principles; adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills) (MIT) |
| Skill | `ui-audit` | Measures static visuals: spacing, geometry, colour, contrast, type, icons, elevation, theme parity |
| Skill | `ux-audit` | Traces behaviour: discoverability, feedback, targets, reversibility, error recovery, forms; motion is review-animations |
| Skill | `a11y-audit` | Drives the UI by keyboard and the accessibility tree, and fills a per-criterion conformance table |
| Skill | `a11y-conformance` | Gives the WCAG 2.2 A and AA criteria and the law behind them (European Accessibility Act, EN 301 549) |
| Skill | `animate` | Builds one animation: gates whether it should animate, then the curve, duration and properties; adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills) (MIT) |
| Skill | `review-animations` | Judges motion against ten standards with values, defaults to flagging, owns the motion verdict; adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills) (MIT) |
| Skill | `improve-animations` | Surveys a codebase's motion and writes prioritized self-contained plans, read-only; adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills) (MIT) |
| Skill | `find-animation-opportunities` | Proposes motion where it helps and rejects the rest, read-only; adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills) (MIT) |
| Skill | `animation-vocabulary` | Turns a vague description of a motion effect into its exact term; adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills) (MIT) |
| Skill | `animation-performance` | Finds why an animation drops frames and keeps it inside the frame budget; adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills) (MIT) |
| Skill | `break-ui` | Feeds a UI piece worst-case data behind a demo or worst-case toggle and reports each break with its fix; adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills) (MIT) |
| Skill | `prototype` | Builds several genuinely different versions of one UI piece behind a switcher, only when invoked; adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills) (MIT) |

### Desktop

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `desktop-ui` | Shell surfaces (bar, popout, OSD, notification, tray, launcher), Hyprland config for animation, blur and layer rules, desktop motion, stress and variant forms (KDE and GNOME HIG) |
| Skill | `qml-ui` | Quickshell and QML: tokens, exclusive zone, per-output windows, scale, Accessible, item-tree dump, qmllint and qmlformat (Qt QML conventions) |

### Terminal

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `cli-ui` | A command that prints and exits: streams, colour, exit codes, errors, signals, secrets, help (clig.dev, no-color.org) |
| Skill | `tui-ui` | A full-screen terminal program: frameworks, keys, focus, layout by width, resize, plain mode, motion, stress and variants |

### Web

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `css-ui` | Plain CSS and HTML with a short Tailwind section, libraries and conventions (Vercel web interface guidelines) |
| Skill | `react-ui` | What React leaves to you: focus and aria, forms, loading states, feedback, gestures, libraries and conventions (Vercel web interface guidelines) |
| Skill | `web-motion` | Motion on a web page: curves as custom properties, compositor-only properties, reduced motion, the Motion library, performance, review and survey terms |
| Skill | `web-harness` | The browser side of break-ui and prototype: a Demo data or Worst case toggle, the variant picker, the CSS fixes for the breaks |
| Skill | `mobile-native` | Makes a web app feel native on a phone: hover, tap highlight, viewport height, input zoom, safe areas, scroll; web only; adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills) (MIT) |
| Skill | `pick-ui-library` | Picks a maintained library for a React or web task instead of a hand-rolled one, only when invoked; adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills) (MIT) |

### Agent and CLI

| Kind | Name | What it does |
| --- | --- | --- |
| Agent | `visualizer` | Renders findings or other structured data as one self-contained HTML page |
| CLI | `qsm-uix` | 9 verbs that turn a screen into numbers, see [USAGE.md](USAGE.md) |

## Install

```bash
claude plugin install qsm-uix@qsm-marketplace
bun plugins/qsm-uix/scripts/install.ts
```

The install script compiles `qsm-uix`, links it into `~/.local/bin` and checks the external tools.
It names them and never installs them. More in [INSTALL.md](INSTALL.md).

## Use

Ask: "audit this UI", "is this accessible by keyboard only?" or "design the colours and spacing for
this panel". The matching skill fires and calls the verbs. You can run them yourself:

```bash
qsm-uix screenshot --out shot.png
qsm-uix crop shot.png --rect 120,40,60,24 --zoom 6 --out zoom.png
qsm-uix contrast shot.png --fg 130,48 --bg 124,44
qsm-uix region-stats shot.png --rect 120,40,60,24 --top 8
```

`--json` prints one envelope. `qsm-uix doctor` reports which tools are missing.

## Caveats

- Every measuring verb needs `magick` (imagemagick). `screenshot` and `burst` need `grim`.
- `a11y-tree` needs `gdbus` and an AT-SPI bus that answers. An audit sends keys with `wtype`.
- `screenshot` and `burst` work on Wayland only. Without `--output` they ask `hyprctl` for the
  focused monitor.
- A region past the image edge is refused, not clipped. `region-stats` caps at 65536 pixels.
- `diff` reports SSIM distortion, where 0 means identical.
- Files go to a `qsm-uix` temp directory unless `QSM_UIX_DIR` or `--out` says otherwise.

## Sources

The skills named "adapted from emilkowalski/skills" carry Emil Kowalski's work under his licence,
given here in full.

```text
MIT License

Copyright (c) 2026 Emil Kowalski

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
