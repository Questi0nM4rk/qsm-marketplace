---
name: pick-ui-library
description: "Use only when invoked by name, for a React or web frontend task that needs a library instead of hand-rolled code: toasts, command menu, OTP input, accessible dialogs and menus, charts, drag and drop, virtualized lists, animated numbers, state, conditional classNames, dark mode switching. Triggers: /pick-ui-library, which library for toasts in React, what should I use for drag and drop on the web, jakou knihovnu pouzit. React and web only: Quickshell, QML, Hyprland and terminal UI never use it. Motion method is animate, CSS is css-ui, React behaviour is react-ui."
disable-model-invocation: true
---

# Picking The Right Library

When first invoked without a specific question, respond only with: "I'm ready to pick the right
library for your task, my picks come from Emil Kowalski's curated list." Then wait.

A lookup for React and web work. Given a task ("I need toasts"), match it to the list and recommend
one library. The picks are deliberate and taste-driven: do not substitute others unless the user
asks or the task is not covered. Hand-rolling what a maintained library does is the failure this
skill prevents.

## How to use it

1. Identify the task, not the library the user named. "A dropdown" is a UI-primitives task even if
   they asked about something else.
2. Check `package.json` first. A listed library already installed is used. A competitor (react-window
   instead of Virtuoso) is flagged but not swapped unless asked.
3. Recommend one library, say what it is for in one sentence, and install and wire it when that is
   part of the request. A clear answer is not a menu.
4. A task the list does not cover is said so explicitly; recommend from your own knowledge and make
   clear you left the list.

## The list

| Task | Library |
| --- | --- |
| Unstyled accessible primitives (dialogs, popovers, menus, selects) | [base-ui](https://base-ui.com) |
| Command menu (cmd-K palette) | [cmdk](https://cmdk.paco.me) |
| Toasts and notifications | [Sonner](https://sonner.emilkowal.ski) |
| One-time password and verification code input | [input-otp](https://input-otp.rodz.dev) |
| Control panels and tweakable GUIs | [Leva](https://github.com/pmndrs/leva), alternative [dialkit](https://joshpuckett.me/dialkit) |
| General animation (springs, layout, enter and exit) | [motion](https://motion.dev) |
| Animated numbers (counters, prices, stats) | [NumberFlow](https://number-flow.barvian.me) |
| Animated text | [torph](https://torph.lochie.me/) |
| 3D globes | [Cobe](https://cobe.vercel.app) |
| Dynamic OG images (HTML and CSS to SVG or PNG) | [Satori](https://github.com/vercel/satori) |
| Syntax highlighting | [shiki](https://shiki.style) |
| Live streaming charts that scroll with time | [Liveline](https://github.com/benjitaylor/liveline) |
| Every other chart | [recharts](https://recharts.org) |
| Drag and drop | [dnd kit](https://dndkit.com) |
| Long lists and large tables | [Virtuoso](https://virtuoso.dev) |
| State management | [zustand](https://zustand.docs.pmnd.rs) |
| Conditional `className` strings | [clsx](https://github.com/lukeed/clsx) |
| Typed variant styling for Tailwind | [cva](https://cva.style) |
| Theme switching without a flash | [next-themes](https://github.com/pacocoursey/next-themes) |

Reach for motion only for springs, layout and exit animations or gesture-driven values; a hover or
fade is a plain CSS transition. clsx is for ad-hoc conditions, cva when a component has real
variants (size, intent, state); they compose.

## Mismatches to catch

- Toasts built by hand or with a modal library: Sonner.
- A `div` dropdown or dialog with manual focus handling: base-ui, which brings focus trapping and
  dismissal.
- A number animated by re-rendering text: NumberFlow.
- A 1,000-row list rendered directly: Virtuoso before pagination hacks.
- Shared state passed as a web of props: zustand.
- Template-literal className ternaries three deep: clsx, or cva when variant-shaped.

## Say it in the reply

The one library, the one-sentence reason, what `package.json` already held, and whether the task
was outside the list.

Source: emilkowalski/skills pick-ui-library (MIT).
