---
name: tui-ui
description: "Use when building or fixing a full-screen terminal program that takes over the screen: panes, lists, forms, dashboards, a picker, keybindings and a key hint bar, focus, layout that follows the terminal size, resize, the alternate screen, a plain mode. Triggers: build a TUI, ratatui, bubbletea, lipgloss, ink, textual, TUI keybinding bar, TUI help screen, alt screen, terminal left in raw mode, terminal layout breaks when I resize, TUI too small, terminal redraw flicker, screen reader plain mode, udelej TUI, klavesove zkratky, rozlozeni v terminalu. A command that prints and exits (colour, streams, exit codes, errors, progress, help, Ctrl-C, pipes, secrets) is cli-ui."
---

# Full-screen terminal programs

A TUI owns the screen, the keyboard and the terminal's modes until it exits. It has no hover, no
pixels, no compositor, and a reader the screen cannot show it to: a screen reader, a log, a pipe, a
shell it must leave intact. Unaided, an agent computes layout from a constant, prints a debug line
in the middle of a frame, forgets to restore raw mode on a panic, and lists keys the screen does not
honour. This skill is the rules for the author who ships such programs. It does not cover a command
that prints and exits (cli-ui), and the rules there (colour order, secrets, exit codes) apply to a
TUI's plain mode and to its first and last second.

Why: ui-design (tokens), a11y-audit (criteria), ux-audit (feedback, interruption), animate and
animation-vocabulary (motion values). Here: how a program that owns the screen behaves. Measure it
headless (below); a screenshot of a terminal proves little.

## Framework

Read the manifest first: a framework already in it wins. A TUI is a loop of input, event, state,
update, layout and render; the framework gives it, so do not fight its idiom.

- Go: Bubble Tea (Model, Update, View) with Lip Gloss for styles, Bubbles for list, table, input
  and spinner, Huh for forms.
- Rust: Ratatui with Crossterm; `Table`, `List` and `Block`, stateful widgets for selection.
- TypeScript: Ink (React for the terminal) with `@inkjs/ui`. Ink 7 and later has an option for the
  alternate screen (inline by default); Ink 8 has no mouse or focus reports and reads the size from
  `useWindowSize()`, not `stdout.columns`.
- Python: Textual (retained widgets, CSS), with Rich for styled plain output.

A display-width helper is already a dependency of the framework; use it, add no second one.

## One architecture, kept apart

- Rendering is a pure function of state and terminal size. I/O is a command or effect (a Bubble
  Tea `Cmd`, a Ratatui channel and task), never a call inside update or draw, because a blocking
  call freezes input.
- Layout is computed in draw from the real area, never in the key handler and never from a
  constant. Budget every pane's outer, inner and text width as integers that sum to the parent
  before writing code: a row of W+1 cells wraps, pushes the top row off and tears the frame, so
  every row is exactly W cells and the frame exactly H rows.
- Logs go to a file or the framework's log channel. A print during a raw-mode or alternate-screen
  session corrupts the frame.

## The screen buffer and the terminal's modes

- A summon-choose-exit tool (a picker) runs inline: chrome on stderr or `/dev/tty`, the chosen
  answer on stdout, so `$(picker)` works. Requiring stdout to be a TTY would refuse its own use. A
  long-lived session takes the alternate screen. On exit, erase the UI or leave a one-line
  receipt, never a half-drawn frame.
- State the terminal contract: a TTY, a minimum grid of your own choosing (design for 80x24
  first), and a fallback for each enhancement (truecolor to 256 to 16 to mono, mouse, hyperlinks,
  bracketed paste). Unicode is likely, not certain: keep an ASCII twin for every glyph and let the
  user force it (`--ascii`). No emoji in chrome.
- Restore on every exit: raw mode, alternate screen, cursor (cli-ui), mouse reporting; on normal
  exit, error, panic and signal (a `Drop` guard, a `defer`, a handler registered once at the
  process boundary). When the framework owns signals, do not add a second handler beside it. A
  shell left in raw mode is the worst failure a user meets.
- Running an editor, a shell or a child is a pause, not an exit: stop input, restore the terminal,
  wait, re-enter the modes, reload what the child may have changed, force a full redraw. Never
  final-unmount an app that must resume. Ctrl-Z suspend has no meaning on Windows.
- Ask for the light or dark background (OSC 11 query with a capped wait, since some terminals
  never answer, or the framework's request), use the default palette until it answers, and offer
  a theme override. Never assume dark.

## Layout by width, and resize

- Write the floor plan per screen: what happens at 80x24, at a 60-column split and below the
  minimum, which pane wins, what hides, what truncates, and when "terminal too small" appears. A
  multi-column layout always has a single-pane fallback. A review that cannot name the floor is
  unfinished.
- Keep width and height in state and recompute from them on each resize event. Coalesce events
  only if layout is expensive enough that dragging the window stutters. Cap content width on a huge
  terminal; prose measure about 72 to 100 cells.
- Truncate by grapheme and by kind as cli-ui's Width does. Centre only a splash, an empty state
  or a dialog.
- Right-to-left text goes in its own field; terminals disagree on bidi, so never reverse by hand.

## Keys

- One key table per state. The footer hint and the `?` help screen are both derived from it, so
  neither can name a key that does nothing here; a test presses every advertised key.
- Everything works by keyboard; the mouse only adds and never gates, and the selection bypass is
  documented. Ctrl-C quits even with a text field focused; `q` quits only when no field has focus;
  Esc backs up one level and closes overlays, and never discards typed text without asking. Ctrl-S
  and Ctrl-Q reach a raw-mode app as plain keys, so binding them is allowed. Handle a lone Esc (tmux
  delays it).
- Exactly one focus is visible, in the same cells whether focused or not, with a cue besides
  colour. The focused row is always on screen.
- Pasted text is data, never keystrokes. Enable bracketed paste (mode 2004) on free-text fields; a
  single-line field keeps the first line of a multi-line paste or refuses it, never submits it,
  because a pasted newline can run as Enter.
- Validate a field on blur or submit, not on each keystroke.
- A destructive action: undo first (act, show the result, offer undo in a toast); a confirm only
  when it cannot be undone, naming the verb and the object, focus on Cancel, default No, a typed
  name for data loss. Never a question that fits every action ("Are you sure?").

## Look and states

- Start monochrome. Colour roles and the 16-colour rule are cli-ui's; here each colour has one
  job (status, active, data); borders only to group, spacing before lines. A glyph marking
  every row marks nothing.
- Design the empty, loading and error views as states with a next action, never as a crash.
- Waits: the thresholds are cli-ui's Progress. On screen the indicator is a row in the frame,
  never a print into it. Esc cancels an in-flight request. Not "Loading...", not "An error
  occurred".
- Motion in a terminal is a redraw, not a composite: animate's curves, durations and property
  rules do not apply. No animation on a keyboard action. A spinner or loop is stepped, never
  carries information alone, and stops when motion is off (cli-ui). One frame clock for the app;
  an idle screen does not tick and a spinner steps every second frame, because the cost is bytes
  written per redraw. Redraw only what changed.
- Depth is one step of background shade or a rule line, never transparency; hierarchy is bold, dim
  and case, never colour alone. The font is the person's.
- Stress it: an environment variable (`APP_DATA=worst`, `empty`, `one`) swaps the data source where
  rows load, and `APP_VARIANT=2` picks a design variant there; one binary prints each, nothing is
  edited. Check at 40 columns and below the minimum. The breaks: sizing by `.length` misaligns on
  wide glyphs, so truncate by display width; a table that no longer fits folds to record blocks.

## Plain mode

Every action is reachable in a linear mode, chosen by a flag or an environment variable
(`--plain`, `ACCESSIBLE=1`), never by guessing a screen reader. In it: no alternate screen, results
on stdout and prompts on stderr, status lines appended instead of repainted, a table flattened to
`Header: value` lines, menu choices numbered, each line labelled by kind, and meaning never carried
by colour or position. Why: screen readers read a TUI poorly, and this mode is the practical help.

## Prove it headless

Drive state transitions, event to action, and a frame at a pinned size and colour profile (80x24,
60 columns and the minimum) with scripted keys (`Down Down Enter`) and an injected clock, with no
TTY, so CI runs it. Snapshot per size, not once.

## Red flags

- Layout from a constant, or in the key handler: move it to draw, from the real area.
- A print, a log call or a library that writes to stdout while the screen is owned: send it to a
  file.
- No restore on panic or signal: add the guard, because the shell stays raw.
- A footer that lists keys by hand: derive it from the key table.
- A mouse-only action, or an action missing from plain mode: add the keyboard path.
- Width by `.length`, rows of W+1 cells, a spinner on an idle screen: fix each, they tear the frame.
- A confirm on every delete: offer undo and confirm only the irreversible.

## Say it in the reply

- The framework and why, the buffer (inline or alternate) and what is restored on exit.
- The floor plan: what 80x24, a narrow split and below-minimum do.
- The key table and where the footer and help read it from.
- What plain mode prints, from a run. Anything unverified: a terminal or size you did not run in.

Sources: gfargo/tui-design-skill (MIT), pageton/tui-design-skill (MIT),
jrschumacher/skill-bubbletea-tui (MIT), clig.dev (CC-BY-SA-4.0, paraphrased).
