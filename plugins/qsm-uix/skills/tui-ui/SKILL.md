---
name: tui-ui
description: "Use when writing or fixing what a command-line tool prints for a person: coloured status lines, a progress bar or spinner, tables that must fit the terminal, output that is garbage when piped to a file or run in CI. Triggers: NO_COLOR, ANSI colours, truecolor, progress bar, spinner, narrow terminal, wrap or truncate a table, piped output has escape codes, colours unreadable on light terminal, CLI output looks bad, barvy v terminalu, tabulka se nevejde. In a qsm binary the result envelope, --json, exit codes and --no-input already exist; this skill does not redo them."
---

# Terminal UI

A CLI is a UI with no pixels, no theme of its own and an unknown reader: a person on a light
terminal, a log file, a CI job, a screen reader reading the stream. Unaided, an agent writes
`\x1b[32m` literals, sizes columns by `string.length`, and draws a progress bar that fills every log
with redraws. This skill is the output rules for the person who ships CLIs and answers for who can
use them. In a qsm binary it does not define the envelope, exit codes, `--json` or `--no-input` (see
below); it does not measure pixels (there are none), and does not pick a TUI framework.

Why: ui-design (tokens), a11y-audit (criteria), ux-audit (feedback timing). Here: how the stream
is written. To measure a CLI, its output stream is the introspection surface: capture it with
colour off and on, and read the bytes.

## In a qsm binary, what already exists

Only in a qsm binary: `lib/outcome.ts` (`renderText`, `renderJson`, `exitOf`) and `lib/cli-base.ts`
(`--json`, `--no-input`, the `process.stdin.isTTY` prompt gate) own the result, the exit code and
the machine-readable form. Return an `Outcome`; never print your own status line around it. They
hold no colour, width or progress logic, so those are the rules below.

## One decision: is a person watching

Decide once, at start, from `process.stdout.isTTY`, and pass the answer down. Write to the stream
that matches the reader: result on stdout, progress and diagnostics on stderr, because a pipe
captures stdout and the person still needs the wait signal.

| Stream | Colour | Progress | Width |
| --- | --- | --- | --- |
| TTY | by tier below | redraw in place | `process.stdout.columns` |
| not a TTY (pipe, file, CI) | none | none; one plain line per milestone | none, never wrap |

Why: escape codes in a file are garbage a reader must strip, and a redrawing bar writes thousands
of lines into a log.

## Colour

- Plain by default; colour is an addition. Off when `NO_COLOR` is set and not empty (any value,
  per no-color.org: an empty string does not count), when stdout is not a TTY, when `TERM=dumb`,
  and under `--no-color`. `FORCE_COLOR` turns it on for a non-TTY and loses to `NO_COLOR`.
  Order: `--no-color`, `NO_COLOR`, `FORCE_COLOR`, then TTY. Why: the user's explicit choice
  outranks detection, and the flag outranks the environment.
- Read `NO_COLOR`, `FORCE_COLOR` and `TERM=dumb` from the environment once, in the one decision
  function, because `getColorDepth` is absent off a TTY and cannot express `FORCE_COLOR`. Use
  `process.stdout.getColorDepth()` (1, 4, 8, 24) only for depth, on a TTY; do not parse `COLORTERM`
  yourself. Strip with
  `Bun.stripANSI`, measure with `Bun.stringWidth` (below).
- Use the 16 base colours and the terminal's default foreground. The user's terminal theme maps
  them to a palette that is readable on its own background; a fixed 256 or truecolor value is
  readable on one background and invisible on the other. Why: the background is unknown, so a
  contrast ratio cannot be computed, and the only safe choice is the one the user already tuned.
- Truecolor and 256 only where the colour itself is the content (a swatch, a heatmap), and only at
  depth 24 or 8. Bold and dim carry hierarchy; do not use dim for text that must be read (many
  themes render it near the background).
- Do not use bright black (90) for text; on several dark themes it is below 3:1 against the
  background. Do not set a background colour; it fights the user's theme.

## Colour is never the only carrier

Every coloured status also has a word or symbol: `ok`, `fail`, `warn` or a glyph beside the colour,
because colour-blind readers, `NO_COLOR` and a piped file all lose it (WCAG 1.4.1). Put the word
first in the line so it survives `cut` and `grep`. A glyph is an addition to the word, not a
replacement: `✔` can render as a box on a limited font.

## Width

- Read `process.stdout.columns`; it is `undefined` or `0` off a TTY or on a size-less pty. Fall back
  to 80 for a TTY of unknown size and to no wrapping for a pipe. Re-read on `resize`, never cache
  at import time.
- Measure display width with `Bun.stringWidth`, never `.length`: a wide glyph (CJK, many emoji)
  takes two cells, an escape sequence takes none, a combining mark takes none. `.length` makes
  every column misalign the moment a name is not ASCII.
- Truncate with an ellipsis, wrap at word boundaries, cut by cells not characters. Truncate the
  least valuable column (a path's middle, a description) and never the key the row is found by.
- Under about 60 columns, a table becomes one record per block (`label: value` lines); a table
  squeezed to unreadable beats nothing but loses to a list.

## Progress and feedback

- Under about 100 ms, print nothing extra. A spinner for a near-instant action is a flash.
- From 1 s, show that work is alive: a spinner or a count on stderr (TTY only). Known total:
  `done/total` and a percentage; unknown: a spinner and the current item. Why: silence past a
  second reads as a hang, and people interrupt a working tool.
- Finish by overwriting the line with the final result, and leave the terminal clean (cursor shown,
  line cleared) on error and on SIGINT too.
- Off a TTY, one line at the start and one at the end of a step that takes over 1 s; never a bar.

## Messages

- One primary message per run: the result or the error, first. Detail follows, indented.
- An error states the cause and the fix: `config missing: ~/.x/cfg.json; run x init`. Not
  "something went wrong", not a stack trace by default. The exit code and the `Outcome` carry the
  class; the text carries the next step.
- No emoji decoration, no banners. The reader scans for the answer; every extra line is cost.

## Red flags

- When you see `\x1b[` or a colour helper called with no gate, route it through the one colour
  decision, because it will leak into pipes and ignore `NO_COLOR`.
- When padding uses `padEnd` or `.length`, switch to `Bun.stringWidth`, because a wide glyph shifts
  every column after it.
- When a status line differs only by colour (red against green), add the word, because the
  difference disappears off a colour terminal.
- When the code parses `COLORTERM` to find the depth, use `getColorDepth()` on a TTY, because the
  detection is already right there; `NO_COLOR`, `FORCE_COLOR` and `TERM=dumb` stay in the one
  decision function.
- When progress writes to stdout, move it to stderr and gate it on a TTY, because the pipe consumer
  gets the redraws.
- When a hard-coded 256 or truecolor value is chosen for text, replace it with a base colour,
  because you cannot know the background.
- When you reach for your own `--json`, exit codes or prompt gate, in a qsm binary use
  `lib/cli-base.ts`, because one outcome system serves every qsm binary.

## Say it in the reply

- The colour decision order you applied, and which stream carries what.
- What a non-TTY run prints, shown from a real piped run (`bin | cat`, and with `NO_COLOR=1`).
- The width used for a table and what happens when it is unknown or narrow.
- Anything unverified: a terminal you did not run in, a font you assumed.
