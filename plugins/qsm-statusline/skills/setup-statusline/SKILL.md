---
name: setup-statusline
description: "Use when the user wants the status line that shows model, context window, subscription rate limits, and git state installed, updated, fixed, or taken off. Triggers: \"set up the statusline\", \"install the status line\", \"my statusline is broken\", \"update the statusline\", \"remove the statusline\", \"show rate limits in the status bar\", \"nastav statusline\"."
---

# Setting up the status line

The status line appears when two things are true: the `qsm-statusline` binary is on `PATH`, and the
user's Claude Code settings file has a `statusLine` key naming it. The installer does the first;
you do the second, with the user's go, because that file is theirs. Install and update are one
action, so there is no separate update path. It does not edit any other key.

## In order

1. Read the state: `qsm-statusline doctor --json` answers `wired`, `absent`, `other` or
   `unreadable`. Report it in one line before changing anything, because acting first is how a
   configured status line gets replaced by accident.
2. Make sure the binary is there: `bun plugins/qsm-statusline/scripts/install.ts` prints
   `installed`, `suggested` with the entry to add, or `missing-prereq` naming the binary that is not
   on `PATH`. Run it even when doctor said `wired`, because that is how an older compiled binary is
   replaced.
3. Write the key only when doctor said `absent`, or `other` and the user chose to replace it. Read
   the file, parse it, set `statusLine`, write it back, leaving every other key as it was. A missing
   settings file is a fresh machine: create it with the one key.

   ```json
   { "statusLine": { "type": "command", "command": "qsm-statusline render", "padding": 1 } }
   ```

4. Tell the user to restart Claude Code, because the status line is read once at startup and
   without a restart the work looks like it failed.

## States and why each is handled so

- `unreadable`: the file is not valid JSON or cannot be opened. Report the path and the reason and
  stop, because it holds the user's configuration you cannot see and a rewrite loses it.
- `other`: name what holds the key, say what would replace it, and wait, because their own script
  is not yours to remove.
- `missing-prereq`: install nothing, name the binary and how to get it, and stop, because a status
  line whose binary is absent prints nothing on every frame and reads as a broken harness.
- Already wired with a freshly compiled binary: say so and change nothing, because rewriting an
  identical key is a diff in the settings file for nothing.
- The command is `qsm-statusline render`, never a path into a plugin directory, because a plugin
  directory is replaced whole on update and the entry would name a file that is gone.
- Removal is instructions, not an edit: name the key and the file to take it out of, and say the
  binary can stay on `PATH`, because removing it undoes the user's decision and they do the undoing.
- A status line that renders wrong: run `qsm-statusline doctor` first; it names the file it read and
  whether the binary answers. A missing row means its source was absent (no repository, no
  subscription window, a git state not yet read), not a crash. Then run
  `qsm-statusline render --no-color < payload.json` on a captured payload before touching anything.

## Red flags

- When you are about to write the settings file without having read it, read it, because the write
  replaces keys you did not know were there.
- When the user said "remove the statusline", give the instructions and delete nothing, because the
  key is theirs to take out.
- When you are about to report success, check you told them to restart, because that is when it
  shows.

## Say it in the reply

One outcome in a line: installed, already up to date, or the failure and its cause. Then the
settings file you read, what you changed in it if anything, and the restart. When the state forbade
a change, say which state and what the user has to do.
