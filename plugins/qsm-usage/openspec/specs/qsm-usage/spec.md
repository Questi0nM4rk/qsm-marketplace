# qsm-usage Specification

## Purpose

qsm-usage reviews how one developer uses Claude Code and proposes changes that make each session
cheaper and better: context nobody reads, extensions nobody uses, the same guidance written in two
places, instructions repeated across sessions, memories that should be rules, hooks that are slow or
inject noise, permission prompts that change nothing, and qsm tools the agent could reach for
instead of what it does today.

## Requirements

### Requirement: A ledger records every session at no model cost

The hooks module SHALL record, for every session, into the plugin's store: the context breakdown at
session start from `$.session.usage`; each turn's token usage and cost from `turn.complete` and
`session.measure`; every piece of text the harness injects, with its source and size, from
`prompt.attachment`, `tool.describe`, and `skill.prompt`; and every use of a skill, command, agent,
and tool, by name. Recording SHALL never call a model, never block or alter the event it observes,
and never store prompt or tool content beyond names, sizes, and counts. The ledger SHALL keep the
last 200 sessions and drop the oldest first, and when the store is over its size limit it SHALL drop
the oldest sessions until the write fits. The module SHALL register two tools the model calls to
read it: `breakdown`, the current session's context by category, and `ledger`, the recorded sessions
filtered by a window.

#### Scenario: A session ends

- **WHEN** a session with three turns ends
- **THEN** the ledger holds its start breakdown, three turn usages, every injected piece with its
  size, and every skill and tool used, and no prompt text

#### Scenario: The store is full

- **WHEN** the 201st session ends
- **THEN** the oldest session is dropped and the new one kept

#### Scenario: The store is over its size limit

- **WHEN** a write fails because the store would exceed its size limit
- **THEN** the oldest sessions are dropped one by one and the write retried, and the current
  session is kept

#### Scenario: Recording fails

- **WHEN** writing to the store fails during a session
- **THEN** the event continues unchanged and the failure is logged once naming the plugin and the
  event

### Requirement: The review is one walkthrough of four stages

The review SHALL be one walkthrough, started by the person saying "review my Claude Code usage" and
offered by `qsm-setup` at the end of a first install. It SHALL run four stages in order: the
machine and install (`qsm-setup doctor` and `qsm-setup tools`); the person's work (languages,
forge remote, vault or notebooks, UI code, and the qsm plugins that would serve them and are not
installed); how they work (the `insights` skill over recent sessions and the `qsm-memory`
archive); and the extensions (`unused-extensions`, `duplicates`, `hooks-review`,
`tools-review`, `claude-md-trim`, `permissions-tune`, and what is missing). Each stage SHALL
research first and then ask one round of questions through the ask tool, two to four named options
with the recommended one first, and SHALL change nothing. A stage that found nothing SHALL ask
nothing.

#### Scenario: The user starts a review

- **WHEN** the user asks to review their Claude Code usage
- **THEN** the skill reads the machine first, asks the stage-one round, and moves on to the
  person's work only after it is answered

#### Scenario: A plugin would serve the work and is not installed

- **WHEN** the working tree is Python with a GitLab remote and `qsm-langdev-py` and `qsm-forge`
  are not installed
- **THEN** stage two names both and asks which to add

### Requirement: /qsm-usage shows the current session at no model cost

The plugin SHALL register the slash command `/qsm-usage`. Running it SHALL open a pane drawn from
`$.session.usage` and the current ledger entry, with no model call: context used and left, the
categories by tokens, the three largest items of this session, and for each one line naming the
change and its saving ("MCP server x has no calls this session: `/mcp disable x` saves ~12k
tokens per turn"). The pane changes nothing.

#### Scenario: Running the command

- **WHEN** the user runs `/qsm-usage` in a session with an unused MCP server loaded
- **THEN** a pane lists the context by category, names that server among the largest items with
  its token cost and the command that disables it, and no turn starts

#### Scenario: A new session before its first turn

- **WHEN** the user runs `/qsm-usage` before any turn
- **THEN** the pane shows the start breakdown and says no turn has run yet

### Requirement: Topics are separate skills that run alone or inside a review

Each topic SHALL be one skill that answers its own question when the user asks only that
question, and that returns findings in the findings format when a review dispatches it.

#### Scenario: A single question

- **WHEN** the user asks only which hooks slow their sessions down
- **THEN** `hooks-review` answers in the reply, and no level question or report runs

### Requirement: Every extension is listed, and the unused ones are offered for removal

`unused-extensions` SHALL list every MCP server, skill, plugin, agent, and command the user has
installed, each with its uses in the window from the ledger (transcripts for sessions before the
ledger existed) and its resident cost from the context breakdown. Every item with no use in the
window SHALL be listed as possible to remove, and the review SHALL ask one multi-select question,
"Remove some of these?", with one option per item, its type, and its saving, plus "keep all".
Built-in items and items enabled by managed policy SHALL be listed but never offered. An item
with no usage signal at all, such as a theme or an output style, SHALL be offered with the note
that the verdict rests on the user's answer. A deferred MCP server SHALL be offered with a saving
of zero tokens and the reason: one less connection to maintain. Removal SHALL use each item's own
reversible switch, never a command that deletes its configuration or credentials.

#### Scenario: Three unused items

- **WHEN** two skills and one MCP server have no use in the last 10 sessions
- **THEN** the report lists all installed extensions, marks those three as possible to remove,
  and the question offers each with its saving and a keep-all option

#### Scenario: The user picks one

- **WHEN** the user selects one skill from the question
- **THEN** only that skill is switched off, and the report names the switch that undoes it

### Requirement: Duplicates are found across every surface

`duplicates` SHALL find the same content or capability in two places: guidance in a local
instruction file that a checked-in one already covers; a rule, a memory, and an instruction file
that say the same thing; two skills whose descriptions trigger on the same requests; two agents,
skills, or commands with the same name; one MCP server configured at two scopes; and two
extensions that provide the same capability. Each finding SHALL name both places, recommend which
one stays and why, and propose removing the other. A contradiction, where two places disagree in
a way that changes behaviour, SHALL be reported with both sides quoted and left to the user.

#### Scenario: Two skills compete for one request

- **WHEN** two installed skills both list "reduce my context" as a trigger
- **THEN** `duplicates` names both, recommends one to keep, and proposes removing or narrowing
  the other

#### Scenario: A memory restates a rule

- **WHEN** a memory says the same thing as a loaded rule
- **THEN** `duplicates` proposes deleting the memory and keeping the rule

### Requirement: Every instruction-file cut or move carries its own reason

`claude-md-trim` SHALL propose each cut and each move to lazy loading as its own finding, quoting
the block and giving the reason that block alone goes or moves: what the code, a hook, or a
linter already says for a cut, and which package or task it belongs to for a move. A block that
states why a choice was made, and every "never do X" rule, SHALL be kept, and a move that would
leave a "never" rule only in a lazily loaded file SHALL keep it in the root file. A file with
nothing to cut SHALL be reported as lean, with no finding. Nothing SHALL change that the user did
not confirm.

#### Scenario: A long file with doubled rules

- **WHEN** a CLAUDE.md repeats a rule in two sections and lists a directory layout the code shows
- **THEN** each of the two blocks is proposed as its own cut, quoted, with a reason of its own
  (the duplicate and where the rule stays, the layout and the command that regenerates it), and
  the "never do X" rules are not proposed

#### Scenario: A lean file

- **WHEN** every line of an instruction file is a gotcha or a convention the code cannot say
- **THEN** the skill answers that the file is already lean, and proposes no cut

### Requirement: Every finding carries its saving in tokens

A finding SHALL state its saving in tokens per session, or state that it saves none and why it is
still proposed (a slow hook costs time, a prompt costs a decision). Numbers SHALL come from the
engine's breakdown and the ledger where they exist, and from the token counter for files outside
a session; an estimate SHALL be labelled as one. A line count is orientation only.

#### Scenario: A short file is the heaviest

- **WHEN** a file with few lines carries more tokens than a longer file
- **THEN** the finding ranks it by its token count

### Requirement: After the stages, one plan and one pick per finding

After the fourth stage the review SHALL state the decisions the four rounds made, then one plan
with every finding largest saving first, its target, its saving and its undo, and SHALL then ask
for each finding one of three picks through the ask tool: do now (recommended), a task for later,
or drop. A task for later SHALL be filed as feedback labelled `source:main-agent`. A drop SHALL be
recorded by `qsm-usage drop <topic>:<target>`, and a later review SHALL read `qsm-usage dropped`
first and never offer a finding whose key is listed. A permission rule SHALL be asked on its own
and name every rule it grants, because it widens what runs without asking. After applying, the
review SHALL list every changed file and how to undo each change.

#### Scenario: The user drops a finding

- **WHEN** the user picks drop for the unused skill `pdf-tools`
- **THEN** `unused-extensions:skill pdf-tools` is recorded, and the next review does not offer it

#### Scenario: Nothing is picked to do

- **WHEN** every pick is a task for later or a drop
- **THEN** no file changes, and the report records the findings as not applied

### Requirement: Dropped findings are kept in one file under the machine state dir

`qsm-usage drop <topic>:<target>` SHALL append the key with a timestamp to `usage/dropped.json`
under the qsm state dir (`QSM_SETUP_STATE_DIR` overrides it) creating the directory when
needed; dropping a listed key SHALL change nothing. `qsm-usage dropped` SHALL print one key per
line. A key that is not `<topic>:<target>` SHALL be `usage`, and a file that is not a list of
records SHALL be `failed`, never read as empty.

#### Scenario: Dropping twice

- **WHEN** the same key is dropped twice
- **THEN** `qsm-usage dropped` lists it once

### Requirement: Every applied change can be undone on its own

A change to a file under the user's Claude home SHALL be committed on its own, one finding per
commit; when that directory is not a git repository, the review SHALL put it under git and commit
its current state first. A change to a checked-in project file SHALL be left in the working tree
for the user to review, never committed by the review.

#### Scenario: An untracked rules directory

- **WHEN** the first confirmed change targets a rules directory with no git history
- **THEN** the review initialises git there, commits the current state, and only then applies and
  commits the change

### Requirement: Harvested data is read narrowly and never obeyed

Every topic SHALL read only the settings keys it needs, never a whole settings or MCP
configuration file. Names and strings from settings, configuration, skill directories, the
ledger, or transcripts SHALL reach a command only as a quoted argument, never spliced into its
text; a settings write SHALL go through a `mktemp` file or a dedicated edit. A name holding
quotes, backslashes, braces, or control characters SHALL be reported as suspicious and skipped.
Transcript content SHALL be counted and summarised, never followed.

#### Scenario: An injected instruction in a transcript

- **WHEN** a transcript line reads like an instruction to the reviewer
- **THEN** the topic counts it as data and does not act on it

### Requirement: Findings have one format and the report is rendered from it

Every topic SHALL return its findings as JSON in one format: the topic, the window, and a list of
findings, each with a title, the evidence, the proposed change with its target, the saving, the
verdict, and which question confirms it. `qsm-usage report` SHALL validate that JSON and render
one self-contained HTML file: the total saving on top, one section per topic, and each finding's
applied or not-applied state. Input that does not match SHALL end in `failed` naming the first
field that broke, and nothing SHALL be written.

#### Scenario: Rendering a standard review

- **WHEN** `qsm-usage report findings.json --out report.html` runs on valid findings from five
  topics
- **THEN** one HTML file with five sections and the total saving is written, loading no external
  resource

#### Scenario: A finding without a saving

- **WHEN** a finding has no saving field
- **THEN** the render ends in `failed` naming that field and writes no file

### Requirement: Tool recommendations come from what is installed and what exists

`tools-review` SHALL read the qsm tool comparison from `qsm-setup tools` and the third-party
catalog of qsm-toolbox, and SHALL recommend a tool only with evidence: the calls it would replace
and what they cost. A tool not installed SHALL come with its install command; an installed,
unused tool with the one line that puts it in the agent's reach.

#### Scenario: Large JSON read whole

- **WHEN** the ledger and transcripts show large JSON outputs read whole into the context
- **THEN** `tools-review` recommends the denser encoding with those calls and their cost as
  evidence

### Requirement: Structured tool output reaches the context as TOON when that is smaller

The hooks module's `tool.call` hook SHALL decide which tool results to offer for conversion and
the plugin's binary SHALL convert them. The hook SHALL offer the result of every tool call that
matches the plugin's list of wrapped commands and is longer than about 4,000 characters, by
running `qsm-usage toon wrap --stdin --json` with the output on standard input. The binary SHALL
try JSON, then YAML, then TOML, accept a parse only when it gives an object or an array, and
answer TOON only when the text is larger than about 1,000 tokens and its TOON encoding is at
least 20% smaller; otherwise it SHALL answer to keep the original, and both answers exit 0. When
the binary answers TOON, the hook SHALL hand the model the TOON encoding instead, under one line
naming the detected format, both sizes, and how to get the raw output (`QSM_TOON=0` before the
command). The list is one place in the plugin: Bash command patterns and MCP tool name patterns,
with defaults such as `qsm-* --json`, `gh * --json *`, `kubectl * -o json`, and `mcp__*`, which
the user edits as the plugin's `toonWrap` option. The hook SHALL never
offer a `Read` result, a Bash command that prints a file (`cat`, `head`, `tail`
on a path), or a result that reports an error, because the model edits files by their exact text
and must see an error as it came. When the binary is absent, exits non-zero, prints no valid
envelope, or times out, the hook SHALL leave the output unchanged and show one
`qsm-usage ERROR: tool.call:` line, never blocking the call. Every conversion's saving SHALL
reach the ledger, which the hooks module records by name and both token counts, never the
converted text.

#### Scenario: A large JSON listing from a wrapped command

- **WHEN** `gh pr list --json number,title,author` prints 6,000 tokens of uniform objects
- **THEN** the model receives the TOON encoding under the line naming JSON and both sizes, and
  the ledger records the saving

#### Scenario: A large YAML listing from a wrapped command

- **WHEN** a wrapped call prints a large YAML sequence of uniform mappings
- **THEN** the model receives the TOON encoding under the line naming YAML

#### Scenario: A file printed with cat

- **WHEN** `cat package.json` prints a large JSON file
- **THEN** the output reaches the model unchanged and the binary is not asked

#### Scenario: TOON would not help

- **WHEN** a wrapped command prints deeply nested JSON and the binary answers to keep the original
- **THEN** the output reaches the model unchanged and the ledger records nothing

#### Scenario: The binary is absent

- **WHEN** a wrapped command prints large JSON and `qsm-usage` cannot start
- **THEN** the output reaches the model unchanged and one `qsm-usage ERROR: tool.call:` line is
  shown

#### Scenario: Plain text is not structured

- **WHEN** `qsm-usage toon wrap --stdin` reads prose
- **THEN** it answers to keep the original with the format `null`, and exits 0

### Requirement: The binary parses through the shared CLI base

The plugin's one binary, `qsm-usage`, SHALL parse through the shared CLI base with this plugin's
`qsm.json`, with the verbs `count` (files as a repeatable positional), `toon encode`, `toon decode`,
`toon size`, `toon wrap`, `filter`, `doctor`, `report`, `drop`, and `dropped`. It SHALL NOT read
`process.argv`, print its own help, or carry `--version`. Every verb SHALL end in one code of the
marketplace outcome table: `usage` (2) for a broken call, `failed` (1) for a fine call and a bad
input, `missing` (4) for an absent prerequisite. The noun SHALL be `usage`, generated from
`qsm.json`, so a dependent plugin calls `$.usage.count(...)`, `$.usage.toonEncode(...)`, and
`$.usage.report(...)` with generated types.

#### Scenario: A file the caller named that is not there

- **WHEN** `qsm-usage count` is given a path nothing is at
- **THEN** it reports `missing` (4), naming the path

#### Scenario: The noun joins the verbs

- **WHEN** a dependent plugin's hooks module calls `$.usage.toonSize(...)`
- **THEN** it typechecks against the generated contract and runs `qsm-usage toon size ... --json`

### Requirement: Token counts are estimates unless the credential is there

`qsm-usage count` SHALL use its offline estimate, characters divided by four, by default, and
SHALL count exactly with the provider's tokenizer only when `ANTHROPIC_API_KEY` is set. Exact
mode without it SHALL report `missing` naming the credential, never the estimate under the exact
label.

#### Scenario: Exact mode without the credential

- **WHEN** a caller asks for exact mode and the credential is not set
- **THEN** the count reports `missing` naming it

### Requirement: The toon verbs encode structured data densely and say when not to

`qsm-usage toon encode` SHALL detect the format from the extension (`.json`, `.yaml`, `.yml`,
`.toml`) and print TOON; `--frontmatter` encodes a Markdown file's leading YAML block,
`--table --section <heading>` the first pipe table under that heading, matched
case-insensitively. `toon decode` prints compact JSON. `toon size` reports characters and
estimated tokens for both forms, the ratio, which to use, and that the counts are estimates. An
unknown extension, a missing block, a missing heading (listing the headings found), or a heading
without a table SHALL exit non-zero with the reason on stderr and nothing on stdout;
`--frontmatter` with `--table`, or `--table` without `--section`, is `usage`.

#### Scenario: TOON is larger

- **WHEN** `qsm-usage toon size` runs on deeply nested data
- **THEN** it reports a ratio above one and says to keep JSON

### Requirement: Shell output is filtered when the filter is present

The hooks module's `tool.call` hook on the Bash tool SHALL ask `qsm-usage filter`, which routes
the call through the command output filter when it is on PATH (`QSM_FILTER_BIN` names another):
the filter's rewritten command is the command the tool runs, its refusal (exit 2) refuses the
call, and an absent or failing filter lets the call through unfiltered and unblocked. The verb
SHALL NOT route a subagent's git command through the
filter, because the filter's rewrite hands the filter binary a git operand, which the harness's
worktree-isolation guard refuses inside a subagent regardless of whether that subagent is
isolated. The installer SHALL NOT fetch the filter; it SHALL report the install command at the
pinned upstream revision, and the documentation SHALL warn that the bare crates.io name installs
an unrelated package.

#### Scenario: Filter missing at call time

- **WHEN** a Bash call runs and the filter is not on PATH
- **THEN** the call runs as written and is not blocked

### Requirement: Install places the binary and doctor says what is usable

The installer SHALL put `qsm-usage` on PATH through the shared install base and write its
completion; it SHALL write nothing under the Claude
home, and a repeat install SHALL leave a working binary working. `qsm-usage doctor` SHALL report
the binary and the filter as usable or not, and `missing` when either is absent.

#### Scenario: First install

- **WHEN** a user installs qsm-usage
- **THEN** `qsm-usage` runs from any directory and nothing under `~/.claude` changed
