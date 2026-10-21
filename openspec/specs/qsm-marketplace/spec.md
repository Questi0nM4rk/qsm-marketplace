# qsm-marketplace Specification

## Purpose

The marketplace itself, layer 0: the shared code under `lib/` that every plugin with a binary, an
installer, or a hooks module builds on, and the gates under `.gates/` that prove the plugins agree
with it.

## Requirements

### Requirement: Every binary parses its arguments from qsm.json through one CLI base

A plugin's `scripts/*.ts` binary entry SHALL hand argument parsing to the shared
CLI base with its `qsm.json` and one handler per declared verb. The base SHALL
parse positional arguments in declaration order, flags as `--kebab-name` with
either `--flag value` or `--flag=value` for string and number arguments and a
bare `--flag` for boolean ones, rejecting a value given to a boolean flag. An
argument marked `repeatable: true` SHALL collect every occurrence into
a list, for a flag and for a positional alike; an argument with `choices` SHALL
accept only a listed value; a verb marked `passthrough: true` SHALL hand
everything after `--` to its handler untouched. The base SHALL reject an
unknown verb or flag, a missing required argument, and a value outside
`choices` with the outcome `usage`, SHALL render `--help` and `<bin> <verb>
--help` from the declared descriptions, and SHALL accept `--json` on every
verb without it being declared. The handler SHALL return an outcome, and the
process exit code SHALL be that outcome's. No binary SHALL parse `process.argv`
itself.

#### Scenario: Help lists every declared verb

- **WHEN** a user runs `<bin> --help`
- **THEN** every `commands` entry for that bin SHALL appear with its
  description, and nothing that is not declared SHALL appear

#### Scenario: A flag's value joined by an equals sign

- **WHEN** a user passes `--flag=value` for a string or number argument
- **THEN** the base SHALL read `value` as that argument, exactly as
  `--flag value` does

#### Scenario: An unknown flag

- **WHEN** a user passes a flag no `args` entry of that verb declares
- **THEN** the binary SHALL report `usage` (the verb's usage on stderr, exit 2)
  without running the handler

#### Scenario: A required positional argument is missing

- **WHEN** a verb declares a positional argument as required and the call
  omits it
- **THEN** the binary SHALL name the missing argument and report `usage`

#### Scenario: A handler reports failure

- **WHEN** a handler returns `failed` for a call that parsed correctly
- **THEN** the binary SHALL exit 1 and SHALL NOT print usage

#### Scenario: A repeated flag

- **WHEN** a verb declares `--target` as repeatable and the call passes it twice
- **THEN** the handler SHALL receive both values in order

#### Scenario: A value outside choices

- **WHEN** an argument declares `choices: [add, remove]` and the call passes `drop`
- **THEN** the binary SHALL name the argument and the allowed values and report
  `usage`

### Requirement: Every binary reports through one outcome system

Every verb SHALL end in one outcome from the shared table, each code a string
with a fixed exit number, a one-line meaning, and a one-line typical cause:

#### Scenario: Nothing found where something was expected

- **WHEN** `qsm-setup install --all` runs against a root with no `plugins/`
- **THEN** the process SHALL exit 4 (`missing`) and the message SHALL name the
  root and the three ways to set it

#### Scenario: A required tool is gone

- **WHEN** a plugin's `doctor` runs and a tool the plugin requires is absent
  from `PATH`
- **THEN** the process SHALL exit 4 (`missing`) naming the tool and how to
  install it; an optional tool that is absent SHALL be only a warning

#### Scenario: A wrapper's consumer fails

- **WHEN** `qsm-secrets env KEY=name -- prog` runs and `prog` exits 3
- **THEN** the process SHALL exit 1 (`failed`) and the envelope's `data.exit`
  SHALL be 3

#### Scenario: A comparison finds a regression

- **WHEN** a verb returns `worse`
- **THEN** the process SHALL exit 3, and under `--json` the envelope SHALL carry
  `"code": "worse"`, `"exit": 3`, and the table's reason

#### Scenario: Warnings beside success

- **WHEN** a verb returns `ok` with two warnings
- **THEN** the process SHALL exit 0, both warnings SHALL appear on stderr in
  text mode and in `warnings` under `--json`, and stdout SHALL hold only the
  message or the envelope

#### Scenario: A collect-all run with one failed item

- **WHEN** a verb returns `partial`
- **THEN** the process SHALL exit 0, stderr SHALL carry a `warning: partial`
  line, and the envelope SHALL carry `"code": "partial"`, `"exit": 0`

#### Scenario: Usage error under --json

- **WHEN** a call passes an unknown flag together with `--json`
- **THEN** stdout SHALL hold one envelope with `"code": "usage"` and stderr
  SHALL hold the usage text

### Requirement: Every installer runs through one install base

A plugin's `scripts/install.ts` SHALL be the shared install base configured
with the plugin root, its upstream tools, and at most one plugin-specific extra
step. The base SHALL, in this order: require `bun` on PATH; compile every
binary declared under `qsm.bin` into the bin directory (`QSM_BIN_DIR`, default
`~/.local/bin`) after removing the legacy bin farm `<data>/qsm/bin` when every entry in it is a
symlink, one named step (a regular file in it is an `error` step naming the file, and nothing in
the farm is removed); compile every classic command hook declared in
`hooks/hooks.json` into the plugin's `dist/`; for each upstream tool, probe it
and run its install command when it is missing and one is declared (a
failure is `error`, or `suggested` for an optional tool); a missing required
tool with no command is `missing-prereq`, an optional one `suggested`, each
naming the command; write the fish completion for each compiled binary; run
the extra step, which fetches what the plugin needs at run time and never
edits a file the user owns. A binary whose content did not change SHALL
report `already`. Under dry run the base SHALL probe like the real run and
print the plan, one line per step, each starting with `would` (or naming a
tool already on PATH), and SHALL report `skipped`, never `installed`. A plugin
with nothing to do SHALL answer `already: nothing to install` in both modes. The
result status SHALL be the worst of its steps in the order error,
missing-prereq, suggested, installed, already, and `--json` SHALL print the
result with every step as data inside the outcome envelope: `error` maps to
`failed`, `missing-prereq` to `missing`, every other status to `ok`.

#### Scenario: A plugin with two binaries and no upstream

- **WHEN** its installer runs on a machine with `bun` and an empty bin directory
- **THEN** both binaries SHALL exist in the bin directory afterwards, both fish
  completions SHALL be written, and the status SHALL be `installed`

#### Scenario: Nothing changed since the last run

- **WHEN** the installer runs again and every compiled file hashes the same
- **THEN** the status SHALL be `already`

#### Scenario: An upstream tool is missing and slow to install

- **WHEN** the tool is not on PATH and the plugin declares no install command
- **THEN** the status SHALL be `suggested` and the detail SHALL carry the exact
  command the user runs

#### Scenario: Dry run

- **WHEN** the installer runs with `--dry-run`
- **THEN** it SHALL write nothing, SHALL list each step it would take, and
  SHALL report `skipped`

#### Scenario: A plugin installed straight onto a machine holding the legacy bin farm

- **WHEN** a plugin's own installer runs on a machine whose `<data>/qsm/bin` holds symlinks
- **THEN** the farm SHALL be gone afterwards, one step SHALL name it, a dry run SHALL say
  `would remove` it and leave it, and a second run SHALL remove nothing

### Requirement: One plugin, one binary, and its words are the noun's path

A plugin that ships a CLI SHALL ship exactly one binary, named after the plugin
(`qsm-usage` for `plugins/qsm-usage`). A verb MAY be several words, declared as
one `commands` key (`"qsm-usage toon encode"`); the words before the last form
a group. The CLI base SHALL match the longest declared verb at the start of the
arguments, and `<bin> <group> --help` SHALL list the verbs of that group. The
generated noun SHALL join every word of a verb into one camelCase method on a
flat noun, so `qsm-forge gh submit-review` is `$.forge.ghSubmitReview`: the
engine takes a noun only as an object of methods, never a nested object. Two
verbs that join to one method name (`status show` beside `status-show`) SHALL
be refused. The noun SHALL be named after the plugin too: its name without
`qsm-`, in camelCase (`$.bookToSkill` for `plugins/qsm-book-to-skill`). The gate
SHALL fail a plugin whose `qsm.bin` declares more than one binary, or one not
named after the plugin, or whose noun is not named after the plugin. Every
binary SHALL answer `<bin> doctor` with one verdict on the outcome table, and
the gate SHALL fail a binary whose `qsm.json` declares no `doctor` verb.

#### Scenario: A two-word verb

- **WHEN** a user runs `qsm-usage toon encode data.json`
- **THEN** the base SHALL dispatch the verb `toon encode` with `data.json` as
  its positional argument

#### Scenario: Help for a group

- **WHEN** a user runs `qsm-usage toon --help`
- **THEN** every verb of the `toon` group SHALL be listed with its description

#### Scenario: The noun joins the words

- **WHEN** the generator runs on a plugin declaring `qsm-forge gh status`
- **THEN** the contract SHALL type `$.forge.ghStatus(...)` and the wrapper
  SHALL run `qsm-forge gh status ... --json`

#### Scenario: Two verbs joining to one name

- **WHEN** `qsm.json` declares both `qsm-x status show` and `qsm-x status-show`
- **THEN** the generator SHALL refuse it naming both verbs and `statusShow`

#### Scenario: A second binary

- **WHEN** a plugin's `qsm.bin` names two binaries
- **THEN** the gate SHALL fail naming the plugin and both binaries

#### Scenario: A binary with no doctor

- **WHEN** a plugin's `qsm.json` declares a binary and no `<bin> doctor` verb
- **THEN** the gate SHALL fail with `<plugin>: its binary <bin> has no doctor verb`

### Requirement: Generated contracts are derived, fresh, and complete

For every plugin with a `qsm.json` bin, `types/index.d.ts` and
`hooks/noun.generated.ts` SHALL be generated from `qsm.json` by the shared
generator, the generator SHALL be deterministic so regeneration never changes
a committed byte, and `plugin.json` SHALL name the types file. Generated files
are derived, so the formatter and the linter SHALL leave them alone through
the repository's own lint configuration, never through an ignore comment. The
generated wrapper SHALL read the outcome envelope: it resolves to `data` on
`ok` and rejects with the code and message otherwise. Because that wrapper
always asks for `--json`, a verb that refuses `--json` SHALL be marked
`noNoun: true` in `qsm.json` and SHALL NOT become a noun method, while help
and completions still list it. A gate SHALL regenerate
and compare bytes, and SHALL fail when a generated file is missing or stale,
when a declared binary has no `commands` entry, or when a `commands` key names
a binary `qsm.bin` does not declare.

#### Scenario: A verb is added to qsm.json without regenerating

- **WHEN** the gate runs
- **THEN** it SHALL fail naming the plugin and the stale file

#### Scenario: A verb the binary reaches only from a shell

- **WHEN** a `commands` entry is marked `noNoun: true`
- **THEN** the generated contract and wrapper SHALL carry no method for it,
  and `<bin> --help` SHALL still list the verb

#### Scenario: A binary declares no commands

- **WHEN** `qsm.bin` names a binary and no `commands` key starts with that name
- **THEN** the gate SHALL fail naming the binary

### Requirement: Fish completions are generated from qsm.json, never hand-kept

One completion file per binary SHALL be generated from its `commands`: each
verb with its description, a group offered first and its verbs after it, each
non-positional argument as a long flag with its description, requiring a value
unless boolean. The file SHALL carry a
marker line, SHALL never overwrite a completion without the marker, and SHALL
be written at install time by the install base and reconciled by the
aggregate installer, which prunes marked completions no plugin declares.

#### Scenario: Tab after a binary name

- **WHEN** the user types `<bin>` and presses tab in fish after install
- **THEN** every declared verb SHALL be offered with its description

#### Scenario: A user's own completion file for the same name

- **WHEN** a file without the marker already exists for that binary
- **THEN** the generator SHALL leave it untouched and report it

### Requirement: Shared code lives in the root library and nowhere twice

Code two or more plugins need SHALL live under root `lib/`, SHALL be imported by
plugins through relative paths only, and SHALL have no second copy inside any
plugin. A plugin SHALL import from root `lib/` and from itself only.

#### Scenario: A plugin copies the completion generator

- **WHEN** a review finds the generator's logic inside a plugin directory
- **THEN** the copy is deleted and the plugin imports the root module

### Requirement: A dependency is declared twice, with a reason

A plugin that needs another SHALL name it in the `dependencies` array of its plugin.json and in a
`### Requirement: Dependencies` of its own spec, one bullet per name that opens with the name in
backticks, a colon and the reason. The two lists SHALL be the same set, and `bun run validate`
SHALL fail, naming every mismatch of every plugin, when they differ. A dependency without a
reason is removed from plugin.json. The gate reads the bullets only; the scenario is read in
review and has one of two shapes. A plugin with no code (skills and agents) has the scenario
"WHEN the plugin is installed THEN `claude plugin install` installs the dependency with it",
because Claude Code installs every name in `dependencies` and the plugin cannot fail for a
missing one. A plugin with code or hooks that calls the dependency at run time has a `missing`
scenario naming what to install, and that code SHALL fail that way.

#### Scenario: A manifest names a dependency its spec does not

- **WHEN** plugin.json lists `qsm-x` and the plugin's Dependencies requirement has no bullet for it
- **THEN** the dependencies gate SHALL fail and name the plugin, `qsm-x`, and which side lacks it

#### Scenario: A spec gives a reason for a dependency the manifest lacks

- **WHEN** the Dependencies requirement bullets `qsm-y` and plugin.json does not list it
- **THEN** the dependencies gate SHALL fail and name `qsm-y`

### Requirement: An MCP server lives until its client lets go

A binary that serves MCP SHALL serve it on stdio through the root library's
`serveStdio`, and SHALL write nothing to stdout but protocol messages. The verb
SHALL hold until the client lets go: stdin closes, the transport closes, or
SIGTERM or SIGINT arrives. Then it SHALL close the server and exit 0. A test
SHALL prove this through the real binary: a client spawns it, lists its tools,
closes stdin, and sees exit 0 with nothing more on stdout. A test against an
in-memory transport alone proves the tools, never the process.

#### Scenario: A client connects to the memory server

- **WHEN** a client spawns `qsm-memory mcp`, sends `initialize` and `tools/list`
- **THEN** it SHALL get both replies on stdout, and the process SHALL still be
  running until the client closes stdin

#### Scenario: The client ends the session

- **WHEN** the client closes the server's stdin, or sends SIGTERM
- **THEN** the server SHALL exit 0 and SHALL write nothing more on stdout

### Requirement: Every hooks module proves its seams and its behaviour, and fails loud

A hooks module reaches the world through seams: a binary's stdout, a model's
reply, a file. The harness's own test runner (`claude plugin test`) cannot
start a process, so each seam SHALL be read by one pure reader in the
plugin's `hooks/` (no engine, no Node) that both legs of the proof share:
a contract test under `bun test` that runs the real binary and feeds its
stdout through that reader, and a behaviour test under `claude plugin test`
that feeds the reader's shapes to the hook and proves what the hook does.
A hand-written stub is never the only evidence a seam works. For the generated
noun the reader is `unwrap`, exported, and one contract test SHALL run every
plugin's real CLI through its own `unwrap`. A classic command hook SHALL have
a test that spawns it with a hook event on stdin and asserts its stdout and
exit. Every `.catch` on a hook SHALL surface the failure to the person as a
toast `<plugin> ERROR: <event>: <reason>` and log the detail, then apply the
hook's stated open or closed policy; a reader that cannot read SHALL say why,
never return a silent null. The gate SHALL fail on a plugin with
`hooks/hooks.json` and no test under `hooks/`.

#### Scenario: The binary changes its output shape

- **WHEN** a plugin's CLI prints an envelope the module's reader does not read
- **THEN** the contract test fails naming the plugin, before any session sees it

#### Scenario: A stale binary on PATH answers a hook

- **WHEN** a hook's `process.run` returns stdout the reader cannot read
- **THEN** the hook toasts `<plugin> ERROR: ...`, logs the stdout, and applies
  its stated policy; nothing is silently skipped

#### Scenario: A plugin adds a hooks module without tests

- **WHEN** the gate runs
- **THEN** it fails naming the plugin and the missing `hooks/*.test.ts`

### Requirement: Every hook is a function hook, and a classic hook is a measured exception

A plugin's hooks SHALL be function hooks in `hooks/register.tsx`, on `tool.call`,
`session.start`, `session.end`, `session.compact` or `prompt.submit`. They SHALL NOT use
`classic.*` or `prompt.section`, `prompt.context`, `prompt.compose`: under managed settings
the engine's `cc-plugin-sec-default` bypasses a user-tier plugin there. A Bash guard SHALL
be a `tool.call` hook that answers `{ deny }`. A classic command hook SHALL exist only for
an event the engine has no function event for, and its source `hooks/<name>.ts` SHALL open
with a comment `classic: <event> has no function event`. Four exist: `qsm-langdev`
`gate-hook` (SubagentStop) and `qsm-worktrunk` `worktree-create`, `worktree-remove` and
`notification-marker`. The gate SHALL print every classic hook and fail on one without the
comment.

#### Scenario: a classic hook without a reason fails the gate

- **WHEN** a plugin's `hooks.json` declares a classic hook whose source lacks the `classic:` comment
- **THEN** the gate fails naming the plugin and the hook

#### Scenario: a migrated guard denies what the classic guard denied

- **WHEN** a migrated guard sees a command its classic form denied
- **THEN** it answers `{ deny }` with the same reason text

### Requirement: A tool cleans before and after itself

Every installer and every tool SHALL remove what an older version of qsm left behind before it
writes, and SHALL leave nothing of its own behind when it ends: no stale link, PATH block,
data directory, backup file or temporary directory. A removal SHALL be named in the output, never
silent, and a second run SHALL remove nothing. Every test and tool that creates a temporary
directory SHALL write its full cleanup, so the temporary directory holds the same entries after
a run as before it. The install purge is specified under qsm-setup.

#### Scenario: A test run

- **WHEN** `bun test` runs to the end
- **THEN** the number of entries in the temporary directory SHALL be the same as before

#### Scenario: An installer finds an older install

- **WHEN** an installer runs on a machine holding an older version's artifacts
- **THEN** it SHALL remove them, name each one, and report nothing left to remove on a second run

### Requirement: Install places, activation asks

Install means what installing software means: afterwards the plugin's first
command runs. A plugin's installer SHALL compile the plugin's own binaries into
the bin directory and its declared hooks into `dist/`, write their completions,
install every missing upstream tool it has an unattended command for, fetch
what the plugin needs at run time (a browser build, a linked binary), and
record what it built. A required tool it cannot install is `missing-prereq`
with the command to run; an optional one is `suggested`. Output of a command
the installer runs SHALL go to stderr, so `--json` stdout stays one envelope.
It SHALL never edit a file the user owns: nothing under the user's Claude home
(`$CLAUDE_CONFIG_DIR`, default `~/.claude`), no instruction file, no rule, no
output style, no settings key, no shell rc, no other tool's configuration; and
it SHALL never start a service or a session. A change to a file the user owns
is an activation: the plugin's `scripts/activate.ts`, run only by
`qsm-setup activate <plugin>`, declares its choices, and a missing choice is
`usage` naming the flag and its values, with nothing written. For an
instruction file the choices are `replace` (our marked block only), `overwrite` (the whole
file) and `skip`; a merge by
hand is the agent's work through the qsm-setup skill, never the binary's
guess. The aggregate installer (`qsm-setup install`) SHALL follow dependencies
and SHALL activate nothing.

#### Scenario: A dependency is installed with its dependent

- **WHEN** `qsm-setup install qsm-builder` resolves `qsm-openspec` as a dependency
- **THEN** qsm-openspec's binaries and completions are placed and nothing under
  the Claude home changes

#### Scenario: Activation with an unanswered choice and no terminal

- **WHEN** `qsm-setup activate qsm-setup` runs without `--instructions`
- **THEN** the process exits 2 (`usage`) naming `--instructions` and its values,
  and writes nothing

#### Scenario: Activation replaces only its block

- **WHEN** `qsm-setup activate qsm-setup -- --instructions replace` runs against a `CLAUDE.md`
  without the managed block
- **THEN** the block is written after the existing content, unchanged

### Requirement: Every CLI serves a person and an agent

Every verb that needs a choice SHALL take it from a flag, and on a terminal
without that flag SHALL ask for it with the options listed and one marked as
the default. The base flag `--no-input` SHALL turn every unanswered choice into
a `usage` outcome naming the flag; it never picks a default. `--json` implies
`--no-input`. The asking, the flag parsing, the base flags and the outcome
codes SHALL come from the shared cli-base, so every qsm binary asks the same
way and refuses the same way.

#### Scenario: An agent runs a verb with choices

- **WHEN** a verb with a choice runs with `--json` and every choice given as a flag
- **THEN** nothing is asked and the envelope carries the result

#### Scenario: A person runs the same verb

- **WHEN** the verb runs on a terminal with a choice left out
- **THEN** the verb asks, showing the options and the default, and continues with the answer
