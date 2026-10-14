# qsm-setup Specification

## Purpose

qsm-setup is the marketplace's own installer, and a proactive one: it brings a machine to the
marketplace, then suggests what the person's work is missing and asks about their way of working.

## Requirements

### Requirement: Aggregate install across the plugin dependency graph

The system SHALL install either every discovered plugin or an explicit list
of named plugins, never a mix of the two in one call. It SHALL order the
work by each plugin's declared requirement on other plugins, install a
required plugin before the one that depends on it, and skip or fail a
plugin whose requirement failed rather than installing it in a broken
state. It SHALL report one result per plugin, and the call SHALL fail as a
whole when any plugin's result failed. A plugin pulled in only as a
requirement SHALL say which named plugin required it. A plugin with nothing
to install, with or without an installer, SHALL answer `already: nothing to
install`. An installer that prints no outcome envelope SHALL be reported
failed, never installed. Install SHALL activate nothing: no plugin's
activation runs as part of it.

#### Scenario: Installing everything

- **WHEN** the user runs install with the all flag and no plugin has been
  installed yet
- **THEN** the system SHALL install every discovered plugin in dependency
  order and report a result for each

#### Scenario: A named plugin depends on one that fails

- **WHEN** the user installs a named plugin whose declared requirement
  failed to install in the same call
- **THEN** the system SHALL NOT install the dependent plugin, and SHALL
  report it `blocked` with the detail `requirement <name> failed`

#### Scenario: An unknown plugin name

- **WHEN** the user names a plugin the marketplace does not discover
- **THEN** the call SHALL exit 2 (`usage`) before installing anything,
  naming the unknown plugin and the known ones

#### Scenario: A requirement nobody named

- **WHEN** `qsm-setup install qsm-setup` pulls in `qsm-essentials`
- **THEN** qsm-essentials' line SHALL start with `required by qsm-setup`

### Requirement: Activation runs one plugin's changes to the user's files, by choice

`qsm-setup activate <plugin> -- <choices>` SHALL run the plugin's
`scripts/activate.ts` and pass its outcome envelope on. The choices follow
`--`, one `--<name> <value>` per option the activation declares. A missing or
undeclared value SHALL exit 2 (`usage`) naming the flag and its values, and
nothing SHALL be written. `--dry-run` SHALL name what would change and write
nothing. A plugin without an activation SHALL exit 4 (`missing`).

#### Scenario: No choice given

- **WHEN** `qsm-setup activate qsm-setup` runs with no `--instructions`
- **THEN** it SHALL exit 2 naming `--instructions <replace|overwrite|skip>`,
  and the Claude home SHALL be unchanged

### Requirement: Doctor reports installed and orphaned plugins

The system SHALL check every installed plugin's own health probe and
report each as PASS, FAIL naming the exit code, or SKIP when the plugin
declares no probe, followed by a summary count of each. A plugin that declares no probe but ships a
binary SHALL be probed by that binary's `doctor` verb. It SHALL
additionally report, as a warning, any plugin recorded as installed
whose source the marketplace no longer discovers. When a single plugin
is named, it SHALL check only that plugin and report only its result.
By default it SHALL print a probe's full output only when it fails;
with verbose requested it SHALL print full output for a passing probe
too. The call SHALL exit failing when any checked plugin's probe, or
the binary drift check, failed, and SHALL exit clean only when every
one of them passed or was skipped.

#### Scenario: A mix of pass, fail, and skip

- **WHEN** one plugin's probe exits zero, one exits non-zero, and one
  declares no probe
- **THEN** doctor SHALL report PASS for the first, FAIL naming the exit
  code for the second, SKIP for the third, and a summary of one pass,
  one fail, one skip

#### Scenario: One plugin named on the command line

- **WHEN** a caller names a single plugin
- **THEN** doctor SHALL run only that plugin's probe and report only
  its result

#### Scenario: Verbose on a passing plugin

- **WHEN** a plugin's probe passes and verbose is requested
- **THEN** its full probe output SHALL appear in the report, not only
  PASS

#### Scenario: An orphaned install

- **WHEN** a plugin is recorded as installed but the marketplace no longer
  lists it
- **THEN** doctor SHALL report it as an orphan, naming the line to drop from
  the install record (a qsm record, not a Claude Code plugin), without failing
  the whole check

#### Scenario: A root that holds no plugins is missing

- **WHEN** any verb runs against a marketplace root whose `plugins/` holds no plugin
- **THEN** it SHALL exit 4 saying the root holds no plugins, and doctor SHALL NOT report the
  recorded installs as orphans

#### Scenario: One plugin fails among many passes

- **WHEN** nine plugins pass and one fails
- **THEN** doctor SHALL exit failing

### Requirement: Doctor checks installed binaries against what was built

Doctor SHALL compare every binary recorded from the last build against
what is reachable on PATH, by content, and SHALL report a binary whose
installed content no longer matches, or that cannot be found where
expected, as FAIL naming rebuild and relink as the remedy. It SHALL
report a matching binary as part of one combined PASS line, and SHALL
report the whole check as SKIP when no build has run yet. This check's
result counts toward doctor's overall pass or fail. Doctor SHALL also FAIL
when PATH finds another file under a built binary's name, naming that file,
and SHALL WARN about every `qsm-*` executable on PATH that no plugin
declares. A failing report of several lines SHALL keep its lines whole, with
the outcome code on its own last line.

#### Scenario: An old binary shadows a built one

- **WHEN** a directory earlier on PATH holds another `qsm-index`
- **THEN** doctor SHALL FAIL naming that file and the built one, and the
  remedy: remove it or put the bin directory first

#### Scenario: An installed binary has drifted

- **WHEN** a binary from the last build is on PATH but its content no
  longer matches
- **THEN** the drift check SHALL report FAIL for that binary naming a
  rebuild and relink as the remedy

#### Scenario: No build has run yet

- **WHEN** the repository has never run its build step
- **THEN** the drift check SHALL report SKIP naming the build command,
  not a failure

### Requirement: Doctor checks the Claude Code installation itself

Doctor SHALL check the Claude Code installation the plugins run in, as one
more group of checks with the same PASS, FAIL, WARN and SKIP report, and
each FAIL SHALL name its fix as an exact command or edit. The checks are:
more than one install, or the running install disagreeing with
`installMethod` in `~/.claude.json`; the native launcher's directory missing
from PATH; a settings file, `~/.claude.json`, or `.mcp.json` that does not
parse, reported with the parser's position and never with the file's
content; an agent file with a `name` that fails validation, or two agent
files in one directory with the same `name`; a skill file whose frontmatter
does not parse; and an installed version behind the latest of its release
channel. Doctor SHALL only report; applying a fix is the skill's work after
the user confirms it. The version lookup SHALL be skipped with one line
when `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is set, and a failed lookup
SHALL be a WARN, never retried.

#### Scenario: A settings file stopped parsing

- **WHEN** `~/.claude/settings.json` holds a syntax error
- **THEN** doctor SHALL report FAIL naming the file and the error position,
  and SHALL NOT print any of its content

#### Scenario: Two agents with one name

- **WHEN** two files in `~/.claude/agents/` declare the same `name`
- **THEN** doctor SHALL report FAIL naming both files and that only one of
  them loads

#### Scenario: No network lookups allowed

- **WHEN** doctor runs with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` set
- **THEN** the version check SHALL report the installed version and SKIP
  the lookup, without a network call

### Requirement: Tools compares installed qsm binaries against main

`qsm-setup tools` SHALL list every qsm binary declared in any plugin's
`qsm.json` on the marketplace's `origin/main`, or installed on PATH, and
report for each: whether it is installed, whether it is new on main,
which verbs main adds or removes against the checkout the installed binary
was built from, and every verb with its description as `qsm.json` states
it. It SHALL read main with `git show` and never check it out; it SHALL
use `origin/main` as last fetched and name the fetch time, and fetch it
first only when `--fetch` is given. A binary on PATH that no plugin
declares on main SHALL be reported as gone from main.

#### Scenario: A binary added on main

- **WHEN** a plugin on `origin/main` declares a binary the machine does not
  have
- **THEN** tools SHALL report it new on main and not installed, with its
  verbs and their descriptions

#### Scenario: A verb added on main

- **WHEN** an installed binary's plugin declares one more verb on main than
  in the checkout it was built from
- **THEN** tools SHALL report that verb as added on main with its
  description

#### Scenario: Stale main

- **WHEN** tools runs without `--fetch`
- **THEN** the report SHALL name when `origin/main` was last fetched and
  SHALL NOT touch the network

### Requirement: Bin farm and completions stay generated, not hand-kept

The system SHALL regenerate the shared bin farm links and the shell
completion files for every command a plugin declares, and SHALL remove a
previously generated link whose plugin no longer declares it. It SHALL
support reporting what would change without writing, and reporting
whether the current farm is stale without changing anything.

#### Scenario: A plugin drops a declared command

- **WHEN** relink runs after a plugin's declared command list shrinks
- **THEN** the system SHALL remove the now-undeclared link and its
  completion entry

#### Scenario: Checking staleness

- **WHEN** relink runs in check mode and a declared command has no
  matching link
- **THEN** the system SHALL exit reporting the farm stale and SHALL NOT
  write any link

### Requirement: Install and relink purge every older qsm artifact, before and after themselves

`qsm-setup install` and `qsm-setup relink` SHALL, before writing anything, remove every
artifact an older qsm version left on the machine, and SHALL name each removal in their
output. The artifacts are: the legacy bin farm `<data>/qsm/bin` when every entry in it is a
symlink; every `# qsm:` block that puts a directory on PATH in a fish `conf.d` file,
`.zshenv` or `.zshrc`, the comment line and the lines that follow it up to the next blank
line; a recorded binary no plugin declares any more; a symlink in the bin directory that
points into the marketplace checkout or into a `uv/tools/qsm-*` tool directory, together with
that tool directory; and an empty plugin data directory under the Claude config directory
whose plugin the marketplace no longer lists. The purge SHALL be idempotent: a second run
removes nothing and says so. It SHALL write no `.bak` or other backup of any file it edits.
After `install` the purge SHALL run again in report-only mode, and any artifact still found
SHALL make the verb fail. `relink --check` SHALL report each artifact as stale without
removing it. Doctor SHALL FAIL, naming each artifact and `qsm-setup relink` as the remedy,
for every artifact the purge would remove, and SHALL FAIL when the first `qsm-*` on PATH for a
declared or built binary is not the installed binary in the bin directory. Every test and tool
that creates a temporary directory SHALL remove it.

#### Scenario: A machine holding every legacy artifact

- **WHEN** install or relink runs against a home that holds the legacy bin farm, a `# qsm:`
  PATH block in fish `conf.d`, `.zshenv` and `.zshrc`, a symlink into the checkout, a uv tool
  link, and empty data directories of absent plugins
- **THEN** each SHALL be gone afterwards, each SHALL be named in the output, no backup file
  SHALL exist, and doctor SHALL then report no failure

#### Scenario: A second run

- **WHEN** install or relink runs again right after
- **THEN** nothing SHALL be removed and the output SHALL say the machine is clean

#### Scenario: Check mode

- **WHEN** relink runs with `--check` on a home holding a legacy farm
- **THEN** the farm SHALL still exist, the output SHALL name it, and the exit SHALL report stale

#### Scenario: A foreign file in the legacy farm

- **WHEN** `<data>/qsm/bin` holds a regular file
- **THEN** the purge SHALL leave the directory in place and doctor SHALL FAIL naming it

#### Scenario: A shadowing binary

- **WHEN** a directory earlier on PATH holds a `qsm-*` file under a declared binary's name
- **THEN** doctor SHALL FAIL naming that file and the installed one

### Requirement: Declared CLIs compile to standalone binaries

For a plugin that declares a compilable command, the system SHALL produce
a standalone executable rather than requiring the plugin's source tree at
run time, and SHALL fail the build, naming the plugin, when a declared
compilable command has no build step behind it. The build step is the
plugin's own installer on the shared install base; build-bins SHALL run it
with machine output and read each step from that output, never from a
free-text line.

#### Scenario: A plugin ships a build step

- **WHEN** build-bins runs for a plugin whose command is declared
  compilable and has a build step
- **THEN** the system SHALL produce the standalone binary and report it
  built

#### Scenario: A compilable command with no build step

- **WHEN** a plugin declares a compilable command but supplies no build
  step
- **THEN** build-bins SHALL fail naming that plugin and command, rather
  than silently leaving the source-mode command in place

### Requirement: The bin farm relinks itself at session start

On session start, the system SHALL check the bin farm for staleness and
relink it automatically when the machine's setup configuration opts in,
without prompting the user. It SHALL NOT attempt to relink when the setup
configuration does not name this machine.

#### Scenario: An opted-in machine with a stale farm

- **WHEN** a session starts on a machine whose setup configuration opts
  into auto-relink and the farm is stale
- **THEN** the system SHALL relink before the session continues

#### Scenario: A machine that has not opted in

- **WHEN** a session starts and the setup configuration does not opt this
  machine in
- **THEN** the system SHALL NOT modify the bin farm

### Requirement: Guided and direct entry points reconfigure qsm

The system SHALL offer a guided flow that asks the user which plugins and
which instruction-install choice they want before acting, and a direct
entry point that runs install or doctor immediately for a user who
already knows what they want. Both SHALL offer the instruction choices
replace, the default, which rewrites only the plugin's marked block and keeps
everything outside it, and overwrite, which rewrites the whole file and runs
only when the person asks for it.

#### Scenario: A first-time guided setup

- **WHEN** the user asks to set up qsm on a machine with no prior
  instruction file
- **THEN** the guided flow SHALL offer to write the file, and SHALL NOT
  write it before the user confirms

#### Scenario: A direct call against an existing instruction file

- **WHEN** the user runs the direct entry point and a global instruction
  file already carries the managed block
- **THEN** the system SHALL replace only that block by default and SHALL
  NOT touch the rest of the file

### Requirement: Setup ends by offering the usage review

The guided flow SHALL end, after doctor, with one offer of the usage review,
and `qsm-setup install` SHALL print the same offer as its last line in human
output. When qsm-usage is not installed the offer SHALL say a review session
needs qsm-usage and give `qsm-setup install qsm-usage`. When it is installed
the guided flow SHALL ask through the ask tool whether to start the review
now, SHALL load the qsm-usage `usage` skill on yes, and on no SHALL name the
phrase that starts it later ("review my Claude Code usage"); the install
line names that phrase. Setup SHALL write nothing and start nothing without
the person's yes. The `--json` envelope SHALL be unchanged.

#### Scenario: qsm-usage is installed

- **WHEN** the guided flow's doctor has reported and qsm-usage is installed
- **THEN** the flow SHALL ask whether to start the usage review now, and on
  yes load the usage skill

#### Scenario: qsm-usage is not installed

- **WHEN** the guided flow's doctor has reported and qsm-usage is not installed
- **THEN** the flow SHALL say a review session needs qsm-usage and give
  `qsm-setup install qsm-usage`, and the install's last line SHALL say the same

#### Scenario: The user declines the review

- **WHEN** the user answers no
- **THEN** the flow SHALL name the phrase that starts the review later

### Requirement: qsm-builder installs at project scope only

The system SHALL NOT list qsm-builder among the plugins the general
profile installs. Inside the marketplace repository itself, qsm-builder
SHALL be enabled through that repository's own project-scoped settings,
so the repository carries its own build tooling without any other
project or machine-wide profile seeing it.

#### Scenario: Installing the general profile

- **WHEN** the user installs the general profile on any machine
- **THEN** the system SHALL NOT install qsm-builder as part of that
  profile

#### Scenario: Working inside the marketplace repository

- **WHEN** a session starts inside the marketplace repository checkout
- **THEN** qsm-builder SHALL be enabled through that repository's own
  project settings rather than a machine-wide install

### Requirement: Five instruction files are activated by choice and kept current

The activation of qsm-setup (`qsm-setup activate qsm-setup -- --instructions
<replace|overwrite|skip>`) SHALL write five generated files into the user's Claude home
(`$CLAUDE_CONFIG_DIR`, else `~/.claude`): `CLAUDE.md`, `rules/implementation.md`,
`rules/context.md`, `rules/git.md` and `output-styles/qsm.md`, and SHALL set `outputStyle` to `qsm`
in `settings.json`, keeping every other key.

Every generated file SHALL carry its generated content between two marker lines, the begin line
starting `<!-- qsm-setup-begin` and the end line starting `<!-- qsm-setup-end`, each an HTML
comment on a line of its own:

```text
<!-- qsm-setup-begin: generated by qsm-setup, which owns and rewrites everything up to qsm-setup-end; write your own text outside this area -->
<!-- qsm-setup-end: generated area ends; text outside it is yours and never touched -->
```

qsm-setup owns the marked area and takes no responsibility for anything outside it. A marker line is
recognised by its prefix, so a file written with the older bare `<!-- qsm-setup-begin -->` is read
as marked. When the plugin's source of a file opens with a YAML frontmatter (the output style's
`name` and `description`, which Claude Code reads only as the first thing in the file), that
frontmatter is generated too: it SHALL stay the first bytes of the file, and the marked area SHALL
follow it. All five files go through one merge, and the choice applies to each of them the same way:

- `replace`, the default, because the plugin is the source of the instructions: SHALL rewrite exactly
  the marked area (and the leading frontmatter, when the source has one) and SHALL keep every byte
  outside it.
- `overwrite`, only when the person asks for it: SHALL rewrite the whole file to the frontmatter
  and the marked area alone.
- `skip`: SHALL leave all five files and `settings.json` alone.

A file without any marker line is migrated by one rule. When its content is recognised as qsm's own
whole-file install, either byte-equal to the plugin's current source or byte-equal to what the
newest `qsm-setup activate:` commit in the Claude home's history wrote to that path, it SHALL be
replaced by the frontmatter and the marked area. Any other content is the person's: it SHALL be kept
whole, the marked area SHALL follow it, and the result SHALL name the file as `kept your text`, so
nothing is ever dropped silently. A file whose markers are broken (a begin without an end, an end
without a begin, an end before the begin, or more than one of either) SHALL fail the step as an
`error` naming the file and the fault, and no file SHALL be written in that run.

It SHALL remove a block between `<!-- qsm-essentials-begin -->` and `<!-- qsm-essentials-end -->`
before it writes, and keep the rest of the file. The activation SHALL be idempotent: a second run
writes nothing, leaves every file byte-identical and reports `already`. It SHALL support a dry run
that names what would change without writing. Before it writes anything it SHALL make the Claude
home a local git repository (`git init` when it is not, never a remote), write its `.gitignore` or
append only the lines it lacks (the person's own lines stay), and commit what is uncommitted as
`before qsm-setup activate`; after writing it SHALL commit the files it wrote as `qsm-setup
activate: <files>`. A git failure SHALL be an `error` step naming the cause, and nothing is written
after it.

#### Scenario: The setup skill asks for the instructions choice

- **WHEN** the setup skill reaches the qsm-setup activation
- **THEN** it recommends `replace`, and before an `overwrite` it asks and names the text outside the
  markers that would be deleted

#### Scenario: A fresh Claude home

- **WHEN** the activation runs with `replace` in an empty Claude home
- **THEN** each of the five files holds the marked area, and the output style opens with its
  frontmatter, which parses with `name: qsm`, followed by the begin marker

#### Scenario: Replace keeps the person's text above and below the area

- **WHEN** a generated file holds text above the begin marker and below the end marker, and the
  choice is `replace`
- **THEN** only the marked area is rewritten and the text outside it stays byte for byte

#### Scenario: An old whole-file install is migrated

- **WHEN** `rules/git.md` has no markers and its content is what an earlier `qsm-setup activate:`
  commit wrote there, and the choice is `replace`
- **THEN** the file becomes the marked area alone, with no copy of the old text

#### Scenario: A file without markers holds the person's own text

- **WHEN** a generated file has no markers and its content is not recognised as qsm's, and the
  choice is `replace`
- **THEN** that content stays unchanged, the marked area follows it, and the result names the file
  as `kept your text`

#### Scenario: Broken markers fail loud

- **WHEN** a generated file has a begin marker without an end marker, or two begin markers
- **THEN** the step is an `error` naming the file and the fault, and no file is written

#### Scenario: Re-install after editing an instruction file in the plugin

- **WHEN** qsm-setup's `instructions/rules/context.md` differs from the installed copy
- **THEN** only the files that differ are written and the result names them

#### Scenario: The block qsm-essentials wrote is still there

- **WHEN** `CLAUDE.md` holds a `qsm-essentials-begin` block and the choice is `replace`
- **THEN** that block is removed, the user's content stays, and one `qsm-setup` block follows it

#### Scenario: Nothing changed

- **WHEN** every installed file matches the plugin
- **THEN** the result is `already`, no file is written, and every file is byte-identical

#### Scenario: The Claude home is not a repository

- **WHEN** the activation runs in a Claude home that is not a git repository
- **THEN** it ends with a repository, the `.gitignore`, and two commits, `before qsm-setup activate`
  and `qsm-setup activate: <files>`; a second run adds no commit

### Requirement: Each instruction file owns one subject

`CLAUDE.md` SHALL hold who the user is, how to talk, the prime directive, intent first, which rule
wins, where things live, the loop with the owner of each of its seven steps, and the one place for
feedback with its command. The implementation rule SHALL hold the six questions asked before any
design, the table of kinds of things with the three answers per kind, one error system per project,
contracts before code, and the design gate. The context rule SHALL hold understand before act, the
restate and when a go is waited for, what is closed, only the ask, large output to files, secrets
never in context, done means verified, memory is never acceptance criteria, the model tiers with the
four agents, and workflows. The output style SHALL hold the shape of a turn, words, form, language,
and the check before sending. A rule SHALL appear in one of the four, and the others SHALL point to
it at most in one line.

#### Scenario: A rule is found in two files

- **WHEN** a review finds the same rule stated in two instruction files with more than one line
  each
- **THEN** one file keeps it and the other is reduced to a pointer or nothing

#### Scenario: A fix-sized ask whose intent is certain

- **WHEN** the ask sizes as a fix and every one of the six questions already has an answer
- **THEN** the agent restates in one line what it understood and the size, and acts without
  waiting for a go

### Requirement: Dependencies

- `qsm-essentials`: the instruction files this plugin writes send every agent to qsm-essentials'
  skills (subagents, debugging, run-and-verify) and its four agents (researcher, runner,
  implementer, web-research); without it those pointers lead nowhere.

#### Scenario: The plugin is installed

- **WHEN** the plugin is installed
- **THEN** `claude plugin install` installs `qsm-essentials` with it
