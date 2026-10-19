---
name: cli-ui
description: "Use when writing or fixing a CLI command that prints and exits: streams, exit codes, colours, progress, terminal tables, errors, help, signals, pipes and credentials. Triggers: CLI NO_COLOR, CLI ANSI colours, piped CLI output has escape codes, CLI progress bar fills the log, CLI stack trace on head, CLI exit code, CLI --help text, CLI Ctrl-C twice, CLI broken pipe, CLI secret in a flag, CLI output looks bad, CLI barvy v terminalu, CLI chybova hlaska, CLI tabulka se nevejde. A program that takes over the whole screen (panes, keybindings, alternate screen) is tui-ui. In a qsm binary the result envelope, --json, exit codes and --no-input already exist."
---

# Command-line output

A command that prints and exits has an unknown reader: a person on a light terminal, a script, a log
file in CI, a program that closes the pipe early. Unaided, an agent writes `\x1b[32m` literals,
sizes columns by `string.length`, prints a stack trace for a user mistake, accepts a token as
`--token`, and redraws a progress bar into every log. This skill is the rules for the author who
ships such commands and answers for everyone who runs them. It does not cover a full-screen
program (tui-ui), and in a qsm binary it does not redo the outcome system (below).

Why: ui-design (tokens), a11y-audit (criteria), ux-audit (feedback timing). Here: how the streams
are written. To check a command, run it three ways (TTY, `| cat`, `NO_COLOR=1`) and read the bytes.

## In a qsm binary, what already exists

`lib/outcome.ts` (`renderText`, `renderJson`, `exitOf`) owns the result, the exit code and the
machine-readable form; `lib/cli-base.ts` owns `--json` and `--no-input`. Return an `Outcome`;
never print a status line of your own around it. They hold no colour, width, progress or signal
logic, so the rules below apply there too. Every rule that names an exit code applies only
outside qsm.

## Streams and exit codes

- The answer goes to stdout, everything else (progress, warnings, diagnostics, prompts) to stderr,
  because a pipe or `>file` captures stdout and the person must still see the rest.
- Exit 0 only for success. Each failure class gets its own non-zero code, listed in `--help`,
  because a script branches on the code and cannot read your prose. Signals follow the shell:
  130 for SIGINT, 143 for SIGTERM.
- Machine output is a contract. `--json` for structure (NDJSON for a stream), `--plain` for one
  record per line that `grep` and `awk` can split. The human view may change between releases; the
  machine shape may not. A script that reads numbers pins `LC_NUMERIC=C`.
- Prompt only when stdin and stdout are a terminal and `CI` is unset. Otherwise fail and name the
  flag that supplies the answer, because a prompt in a pipeline hangs it. The explicit exception
  is a composable picker: open `/dev/tty` for interactive input and chrome, reserve stdout for the
  selected value, and fail if that TTY is unavailable. In CI or with `--no-input`, never prompt,
  through either channel (gfargo `cli-basics.md`).
- Long output to a person on a TTY may go through a pager, never to a pipe.

## Libraries

The manifest decides first. In TypeScript: `commander` for arguments, `picocolors` or `chalk` for
colour (their disable rules differ by version, so the one decision function still owns it), `ora`
for a spinner, `cli-progress` for a bar, `@clack/prompts` for wizard prompts, `string-width`
for width. Inside Ink, `<Spinner>` replaces `ora` (tui-ui).

## Secrets

A secret never arrives as a flag value or an environment variable: both leak, the first through `ps`
and shell history, the second through child processes, crash dumps and logs. Read it from a file
(mode 0600, set explicitly, not by umask), from stdin, or from the credential store (qsm-secrets
here). The flag takes the path: `--token-file`. Never echo it back, not even a prefix.

## One decision: is a person watching

Decide once at start, per stream: stdout and stderr each have their own `isTTY`, because piping
stdout does not make the stderr diagnostics unreadable. Pass the answer down.

| Stream | Colour | Progress | Width |
| --- | --- | --- | --- |
| TTY | by the order below | redraw in place | `columns` |
| not a TTY (pipe, file, CI) | none | none; one plain line per milestone | none, never wrap |

## Colour

- Colour is an addition. Off when `--color=never` or `--no-color`, when `NO_COLOR` is set and not
  empty, when `TERM=dumb`, and on a non-TTY stream. On when `--color=always`, or when `FORCE_COLOR`
  is set, even for a non-TTY. Order: the flag, then `NO_COLOR`, then `FORCE_COLOR`, then detection.
  Why: the user's explicit choice outranks detection and the flag outranks the environment.
  Document the order in `--help` and test the variables together, because runtimes disagree
  (`FORCE_COLOR=0` means off in the chalk convention; one tool may let it beat `NO_COLOR`).
- Read the environment in one decision function, once. In Bun, `process.stdout.getColorDepth()`
  (1, 4, 8, 24) returns 24 on a TTY and is absent when piped (measured); use it only for depth.
- One semantic role per job (ok, warn, error, info, muted, emphasis, path), mapped to colours in
  one file; no literal colour in a call site. Conventional meanings: green ok or added, red error
  or deleted, yellow warning or modified, cyan or blue for paths and hints, dim for secondary text,
  bold for headings.
- Use the 16 base colours and the default foreground: the theme maps them to a palette that is
  readable on its own background, while a fixed 256 or truecolor value is readable on one background
  and invisible on the other. Truecolor only where the colour is the content (a swatch, a heatmap),
  at depth 24. In a command's scrollback and plain output set no background colour; it fights the
  theme. Full-screen depth is tui-ui's.
- Colour is never the only carrier (WCAG 1.4.1): every coloured status also has a word or glyph
  (`ok`, `fail`, `warn`), and piped output gets `[ok]`, `[!]`, `[x]`. The glyph adds to the word,
  because a limited font draws it as a box.

## Width

- `process.stdout.columns` is undefined off a TTY. Use 80 for a TTY of unknown size, no wrapping
  for a pipe, and re-read on `resize`.
- Measure display width (`Bun.stringWidth` or `string-width` in TypeScript), never `.length`: a wide
  glyph takes two cells, an escape sequence none. Pad and cut by cells.
- Truncate by kind and reserve one cell for the `…`: a path from the start or the middle, prose from
  the tail, never the column the row is found by. Keep whole grapheme clusters within the
  display-cell budget, so emoji and combining marks are not split. Wrap only prose, never a table
  cell.
- Narrower than 80 columns, a table folds to one record per block (`label: value`).
- Number columns right-aligned, dates fixed-width ISO.

## Progress

- Acknowledge long-running work promptly; direct-response timing is ux-audit's and wait thresholds
  are ui-design's.
- A spinner or bar appears only after 150 to 300 ms, on stderr, on a TTY, and once shown stays 300
  to 500 ms. Every wait over 1 s has feedback; past about 1 to 2 s the spinner shows elapsed time
  (gfargo `visual-patterns.md`), and a known total past about 10 s becomes a bar with `done/total`.
  A spinner names its subject. animate's motion rules do not apply to a spinner: it is a stepped
  redraw.
- Steps that succeed fold their logs away; the step that fails prints its log, because the
  person needs it exactly then.
- Finish by overwriting the line with the result. Leave the terminal clean (cursor shown, line
  cleared) on error and on Ctrl-C.
- Off a TTY, one line at the start and one at the end of a step; never a bar. With motion off
  (the tool's own switch, named in `--help`), one static "working" line, then the final status.

## Messages and errors

- An error says what was attempted, what failed and why, then the fix as a command that can be
  run: `cannot read ~/.x/cfg.json: missing; run x init`. Not "something went wrong", not a trace.
- Put the most important line last, because the eye lands at the end of a long output: the fix
  command is the final line. Group repeated errors under one header with a flag to list all.
- A "did you mean" suggests and never runs. A traceback appears only under `--debug`; an
  unexpected failure writes a log file and names its path.
- Success names the completed action and object (`rolled back api to v2.3.9`); an error names its
  cause and remedy. Loading text names the work in progress, because an unnamed status says little.
- No emoji decoration, no banners; every extra line is cost.
- Reversibility follows ux-audit's rule. In a command, make the act reversible (trash, backup)
  and ask nothing when that succeeds.
  Otherwise the ladder: moderate asks y/N or offers `--dry-run`, severe needs the object's name
  typed; `--force` or `--yes` skips it, and with no TTY the command refuses without `--force`.
  Default answer No; the question names the verb and the object, never "Are you sure?".

## Help

- `-h` and `--help` print help wherever they stand in the line and ignore other arguments; `-h`
  means nothing else. With no arguments, print one sentence, one or two examples, the common
  flags and "run --help".
- Examples come before the flag list, because people copy an example and skim the flags.

## Signals and closed pipes

- First Ctrl-C: print one line at once, exit, and bound the cleanup with a timeout. The line says
  what a second Ctrl-C does. Second Ctrl-C: skip the cleanup and exit. Register the handler once at
  the process boundary; a library that owns signals already keeps its own.
- A reader that closes the pipe (`cmd | head`) ends the command with exit 0 or 141 and no trace:
  catch `EPIPE` on stdout (Node: `process.stdout.on("error", ...)`), stop writing, exit.

## Red flags

- A `\x1b[` or a colour helper with no gate: route it through the one colour decision, or it leaks
  into pipes and ignores `NO_COLOR`.
- `padEnd` or `.length` for columns: use display width, or a wide glyph shifts the rest.
- A status that differs only by colour: add the word.
- Progress on stdout, or a bar with no TTY gate: move it to stderr and gate it, because the pipe
  consumer gets every redraw.
- A secret in a flag, an environment variable or an echo: change it to a file, stdin or the store.
- A stack trace on `| head`: handle `EPIPE`.
- Your own exit-code mapping in a qsm binary: use `exitOf` in `lib/outcome.ts`;
  `lib/cli-base.ts` owns the `--json` and `--no-input` flags.

## Say it in the reply

- The colour order applied, and which stream carries what.
- What a non-TTY run prints, from a real piped run (`bin | cat`, and with `NO_COLOR=1`).
- The width used for a table and what happens when it is unknown or narrow.
- What Ctrl-C and a closed pipe do, from a run. Anything unverified: a terminal you did not run in.

Sources: clig.dev (CC-BY-SA-4.0, paraphrased), gfargo/tui-design-skill (MIT, `cli-basics.md`,
`ecosystem-typescript.md` and `visual-patterns.md`), pageton/tui-design-skill (MIT). Wait thresholds
are ui-design's.
