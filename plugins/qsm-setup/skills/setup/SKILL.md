---
name: setup
description: "Use when the user wants qsm on a machine or wants to change what is installed or asks what to add: set up qsm, install the plugins, which plugins do I have, reconfigure qsm, doctor says, fix my Claude Code install, which qsm tools are new on main, the bin farm is stale, add a plugin to this machine, nastav qsm, nainstaluj pluginy."
---

# Setup

qsm-setup is the marketplace's proactive installer. A user who knows what they want names the verb;
one who does not gets a guided run that picks the arguments, asks for the go before anything is
written, and ends by offering the usage review (the qsm-usage skills do the judging). Install
changes no file the user owns; only an activation writes into the Claude home, so each one waits
for its own answer.

## Direct

Run the verb the user named, read the per-plugin lines, report them.

- `qsm-setup install --all`, `qsm-setup install <plugin...>`, or `qsm-setup install --profile
  general`: exactly one of the three; dependency order is the tool's job.
- `qsm-setup doctor [<plugin>] [--verbose]`: one line per installed plugin, orphans as warnings,
  the built-binaries check, the activation state of each plugin, then the `claude ...` lines for
  the Claude Code installation.
- `qsm-setup activate <plugin> -- <options>`: the activation step of one plugin, see Guided.
- `qsm-setup relink [--check]`: completions regenerated, undeclared binaries and completions
  pruned; `--check` writes nothing and exits 1 when stale.
- `qsm-setup build-bins`: every plugin's own build step, then the record doctor compares against.
- `qsm-setup tools [--fetch]`: the qsm binaries on `origin/main` against this machine, verbs added
  and removed. Without `--fetch` it says how old main is and stays offline.

## Guided

1. Ask which plugins, with the general profile as the recommended answer: general, everything, or
   a named list. `qsm-setup install --all --dry-run` lists every plugin and what its installer
   would do. qsm-builder is not in the general profile and installs at project scope inside the
   marketplace checkout only, so offer it only there.
2. Get the go, then run one install call and read every status line. `suggested` means the
   installer left a command for the user; `blocked` means a requirement failed first;
   `missing-prereq` names a tool to install by hand.
3. Then the activations, one question each, `--dry-run` first, then the user's choice, because an
   activation writes into the Claude home. Doctor shows which plugins are activated.
   - qsm-setup: `qsm-setup activate qsm-setup -- --instructions <replace|overwrite|skip>`.
     Replace is the default: the plugin is the source of the instructions, and the activation
     rewrites only its own marked area in every file it writes (CLAUDE.md, the rules, the output
     style), keeping everything outside the markers, where text specific to this device lives. Overwrite rewrites the whole file and runs only when the person
     asks for it.
   - qsm-memory, when installed: "Use the qsm session archive as the one memory? Claude Code's own
     memory is then turned off (`autoMemoryEnabled: false`) and its transcripts are deleted a week
     after the archive has them (`cleanupPeriodDays: 7`); the MCP is already connected by the
     plugin." Yes: `qsm-setup activate qsm-memory -- --memory qsm`. No: `--memory skip`.
4. Run doctor and report PASS / FAIL / SKIP per plugin, the `claude ...` lines and the summary
   line. A FAIL is a finding for the user, not something to retry.
5. End with the usage review offer, the one walkthrough setup hands off to.
   - doctor shows qsm-usage is not installed: say that a review session needs qsm-usage and give
     `qsm-setup install qsm-usage`.
   - it is installed: ask through the ask tool whether to start the usage review now. On yes load
     the qsm-usage `usage` skill and the rest is its work. On no say the phrase that starts it
     later: "review my Claude Code usage".

Write nothing and start nothing until the person says yes to that one.

## Claude Code health

Doctor's `claude ...` lines only report. Each FAIL names its fix; show the line and the exact fix,
ask once per fix, apply it after the yes, never a batch "fix all". Then run doctor again.

- Removals (`claude installs`): run the command the line names.
- PATH (`claude path`): add the line to the shell profile the user names.
- A file that does not parse (`claude config`): read only the lines around the named line and
  column and fix the JSON there.
- One key (`installMethod`): read and write that key alone, `jq '.installMethod' ~/.claude.json`.
  Settings files and `.claude.json` hold tokens and paths, so never `cat` one or print its content
  in the reply; name the file, the key and the position.
- Agents and skills: add the missing `description:` line, rename one of the shared `name:` values,
  or fix the frontmatter YAML at the named lines, showing the user the change.
- Version (`claude version`): `claude update`.

## Red flags

- When the run is about to end after doctor with no usage review offer made, make it, because the
  person otherwise never learns the review exists.
- When it is a first setup, show a dry run before the install, because the user has not seen what
  gets written.
- When you want `--all` and plugin names in one call, pick one, because the tool refuses both.
- When you are about to choose overwrite, ask first and name the text outside the markers it would
  delete, because that text is specific to this device and lives nowhere else.
- When a status is `suggested`, report it as not installed, because the user still has a command
  to run.

## Say it in the reply

After install, one line per plugin, `name: status: detail`, nothing summarised away. After doctor,
the summary line plus every FAIL with its exit code and remedy.
