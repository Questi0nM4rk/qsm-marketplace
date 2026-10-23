# qsm-essentials Specification

## Purpose

qsm-essentials is the method every session can draw on: the method skills an agent applies, and the
four agents that research, run, implement and search the web. The always-loaded instruction files
belong to the plug-in that installs them, not to this one.

## Requirements

### Requirement: Ten method skills, each under the cap, no references

The plugin SHALL ship `software-design`, `software-testing`, `refactoring`, `debugging`,
`domain-modeling`, `software-architecture`, `distributed-systems`,
`run-and-verify`, `writing`, and `subagents`. Each SKILL.md SHALL be at
most 12 KB, SHALL carry a one-line description that names when to use it and its trigger phrases,
SHALL state its rules as decisions an agent applies with the reason beside each, SHALL end with
what of it the user sees in the reply, and SHALL cite no book, page, or author. How the reply
reads belongs to the output style alone, and no skill SHALL restate it. No skill SHALL have a
`references/` directory. A rule that belongs to another skill SHALL be a one-line pointer, not a
restatement.

#### Scenario: A skill grows past the cap

- **WHEN** a SKILL.md exceeds 12 KB
- **THEN** the validate gate fails and the skill is split into two subjects or cut

#### Scenario: A file names another plug-in

- **WHEN** a review finds a skill, agent, README or spec of this plugin naming another plug-in or
  its binary (a code index, web search) instead of its role
- **THEN** the mention is replaced with the role, said concretely ("a code index tool that
  searches and lists callers", "a meta-search bin that queries several engines") with the note that
  the installed plug-in's own skill carries the exact calls, because the plugin is the core and
  declares no dependency

#### Scenario: A test-file idiom is asked for

- **WHEN** an agent needs the shape of a test file in a language
- **THEN** it finds it in that language's langdev plugin, and the essentials plugin holds no
  test-framework skill

### Requirement: run-and-verify is three rules

The `run-and-verify` skill SHALL state three rules and no more: a change is done when the running
system was seen doing what was asked, not when the build passes; when nothing written says how the
project runs, the agent SHALL ask once; after the person's go, the agent SHALL write the run down
in the project.

#### Scenario: A change with a green build

- **WHEN** the build passes but the agent has not run the changed path
- **THEN** the agent runs it and reports what it saw before saying the change works

#### Scenario: Nothing written says how to run

- **WHEN** the project has no written way to run it
- **THEN** the agent asks once how to start it and write the answer into the project after the
  person's go, so the next session does not ask

### Requirement: The design, testing, modelling, architecture, distribution and writing skills

Each of `software-design`, `software-testing`, `domain-modeling`, `software-architecture`,
`distributed-systems` and `writing` SHALL fire on the task its description names (cutting a module
or interface; deciding whether a change needs a test and the cheapest proof; modelling business
rules; choosing an architecture style and recording the decision; splitting services and choosing
how they talk; writing what a reader ships or keeps) and SHALL give the decisions with the reason
beside each. None SHALL restate another skill's rules, hold a language idiom, or fire on a task
outside its description.

#### Scenario: A task inside a skill's subject

- **WHEN** the person asks for a module split, a test decision, a domain model, an architecture
  choice, a service boundary or a commit message
- **THEN** the matching skill loads and its rules shape the answer

#### Scenario: An unrelated task

- **WHEN** the task is a plain question that none of the subjects covers
- **THEN** no essentials skill fires

### Requirement: refactoring starts from a full index and plans better

The `refactoring` skill SHALL have the agent request a full index of the code, work through every
caller and call site it lists, and produce a plan of ordered steps, each proved by a real run,
that is better than a plain model's plan. It SHALL keep structure and behaviour in separate
commits.

#### Scenario: Rename across many callers

- **WHEN** the person asks to restructure code that has many callers
- **THEN** the agent lists the callers from the index first and presents ordered steps, each with
  the run that proves it

### Requirement: debugging finds a cause in steps and reports what, how and why

The `debugging` skill SHALL work in steps: reproduce the failure as one rerunnable command, find
the cause, make the one fix for it, then report what was wrong, how it was found, and why the fix
holds. A retry, skip or weakened check SHALL NOT count as a fix.

#### Scenario: A failing test

- **WHEN** a test fails and the cause is unknown
- **THEN** the agent reproduces it, finds the cause, fixes that cause, and the reply states what,
  how and why

#### Scenario: A flaky test

- **WHEN** a test fails only sometimes
- **THEN** the agent measures its failure rate and compares a pass with a fail instead of adding a
  retry

### Requirement: subagents says how and why to delegate

The `subagents` skill SHALL tell how to hand work to a subagent and why: a task with an acceptance
check the agent can run, its own worktree for a writer, a design decision settled with the person
first, and a returned briefing treated as a belief to check, not proof.

#### Scenario: Handing a task to an agent

- **WHEN** the main agent delegates a bounded task
- **THEN** the task carries a runnable acceptance check and a worktree, and the reply gives the
  reason for delegating

#### Scenario: An agent reports it works

- **WHEN** a subagent returns "complete"
- **THEN** the main agent runs the acceptance check before accepting it

### Requirement: Researcher agent

The plugin SHALL provide an agent that answers where, what, and how over a code tree the session
has or over an external dependency at the version the project installs, using a code index when
one is on PATH and plain search otherwise. It SHALL return a briefing of at most fifteen lines
with `path:line` citations and the path of a notes file, SHALL append to an existing notes file
for the same tree, and SHALL NOT edit the target tree or run its build or tests.

#### Scenario: Dependency question

- **WHEN** the question concerns a library the project uses
- **THEN** the researcher finds the installed version first and answers for that version, naming
  it in the first line

### Requirement: Runner agent

The plugin SHALL provide an agent that runs one given command in a given directory with the full
output captured to a log file, and returns a briefing of at most twelve lines: the command and
exit code, the result with counts, the deciding failure lines verbatim, what they point at, and
the log path. It SHALL NOT change the command, retry it, or edit any file, and SHALL stop before
running a command that deletes, force-pushes, or reaches outside the named directory unless told
the main agent knows.

#### Scenario: Two tests fail out of many

- **WHEN** a test suite finishes with failures
- **THEN** the briefing names each failing test with its assertion message and the count of
  passed, failed, and skipped

### Requirement: Implementer agent

The plugin SHALL provide an agent that implements one bounded task in the worktree the main
agent names, proving each acceptance check by running the real path end to end, committing on
its own branch per working step, with at most three attempts per failure before stopping. It
SHALL return a briefing that starts with `complete`, `blocked`, or `deviated`, names the
verification commands with counts, lists the commits, and gives the detail file path. It SHALL
NOT merge, rebase, push, touch another tree, weaken a check, or say complete without having run
the full test command.

#### Scenario: Third attempt fails

- **WHEN** the same test still fails after three attempts
- **THEN** the implementer stops, records the three attempts, and returns `blocked`

#### Scenario: Two readings of the task

- **WHEN** the task text allows two readings
- **THEN** the implementer takes the one the acceptance check supports and returns `deviated`
  with the choice named

### Requirement: Web research agent

The plugin SHALL provide an agent that climbs a ladder of sources (documentation service, managed
search, meta-search bin, fetch and read, stealth browser bin), skipping a missing rung with one
line, for at most five rounds, saving each relied-on page to a file with its URL and date. It
SHALL return `answered`, `partly answered`, or `unresolved`, the answer with versions, up to five
dated sources, what is unverified, and the saved paths. It SHALL NOT fabricate an answer, a URL,
or a version, and for `unresolved` SHALL list the queries and pages that failed.

The agent is the default for its role: a plug-in that ships its own `web-research` agent replaces
it, and the role resolves to the installed plug-in's. The core keeps one fire eval, so the default
is dispatched on a web question and not on an unrelated one.

#### Scenario: Ladder exhausted

- **WHEN** five rounds end without an answer
- **THEN** the agent returns `unresolved` with the queries run and the blocked pages

### Requirement: Every agent names its model, and the person sees it

A function hook on `agent.spawn` SHALL refuse every spawn that names no model, from the Agent tool,
a workflow's `agent()` or a plugin, with a reason that names the tiers (haiku, sonnet, opus,
fable); a fork is exempt, because it always runs on its parent's model. A model left out inherits
the session's, usually the most expensive one, and the context rule says there is no case where
that is right. A spawn that names a model SHALL have its description start with the tier in
brackets (`[sonnet] researcher: …`), unless it already starts with `[`. A `ui.render` hook on the
transcript's `ToolUse` row of an Agent call SHALL draw the tier before the row in a colour of its
own (haiku green, sonnet cyan, opus magenta, fable yellow), so the person tells the tiers apart at a
glance. The hooks SHALL raise no toast.

#### Scenario: an Agent call without a model is refused

- **WHEN** the Agent tool starts a `researcher` with no `model`
- **THEN** the spawn is denied with a reason naming the tiers, and no agent starts

#### Scenario: a fork needs no model

- **WHEN** a fork of the session is spawned with no `model`
- **THEN** it starts

#### Scenario: a named model tags the description and colours the row

- **WHEN** an Agent call names `sonnet`
- **THEN** its description starts with `[sonnet]`, and its transcript row starts with `sonnet` in
  cyan

### Requirement: No Bash call sends a job to the background

A `tool.call` hook on Bash SHALL refuse a command with a lone `&` outside quotes and comments,
because the call returns and its children are orphaned, and SHALL name `run_in_background`,
separate agent calls, and the qsm-essentials:subagents skill. `&&`, `|&` and the redirections
`2>&1`, `&>` and `>&2` SHALL pass.

#### Scenario: A job sent to the background

- **WHEN** an agent runs `sleep 5 &` in one Bash call
- **THEN** the call is refused and the refusal names `run_in_background`

#### Scenario: A redirection

- **WHEN** an agent runs `bun test 2>&1 | tail`
- **THEN** the hook lets the call run

### Requirement: The core names no plug-in and declares no dependency

The plugin SHALL have no `dependencies` in plugin.json, and its skills, agents, README and spec
SHALL name no other plug-in or plug-in binary; a tool is named by what its role does (a code index
that searches and lists a symbol's callers, a meta-search bin that queries engines the managed
search does not reach, a fetch bin that reads a page as text, a browser bin that opens a page that
blocks fetching), said with the note that the installed plug-in's own skill carries the exact calls,
and used when it is on PATH. A role with no tool on PATH SHALL be skipped with one line, never
silently.

#### Scenario: No code index on PATH

- **WHEN** the researcher finds no code index tool
- **THEN** it says so in one line and continues with `ast-grep`, `grep` and `glob`

### Requirement: Nothing specific to a language, project, or machine

The plugin SHALL hold no language or framework idiom, no project fact, and no machine fact. A
project's run and verify facts SHALL be written into that project by the agent, after asking, and
the `run-and-verify` skill SHALL say how.

#### Scenario: A machine path appears in a skill

- **WHEN** a review finds a home path, a port, or a hostname in an essentials file
- **THEN** it is removed and the fact moves to the machine's local configuration
