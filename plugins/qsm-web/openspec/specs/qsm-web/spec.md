# qsm-web Specification

## Purpose

qsm-web owns web research: one loop, a skill for each tool it uses, and the CLI that drives them.

## Requirements

### Requirement: qsm-web searxng queries the configured instance

The `search` verb SHALL query the instance named by an instance flag, an
environment variable, or a config file, in that order, and return the
results as its outcome data: one array, each entry carrying URL, title,
snippet, engine or engines, category, score, and published date when
supplied.

#### Scenario: A query returns results from multiple engines

- **WHEN** a query is issued with no engine restriction
- **THEN** the outcome data SHALL be an array where each result's engines
  field lists every engine that returned it

#### Scenario: No instance configured, or unreachable

- **WHEN** no instance URL is configured
- **THEN** the verb SHALL return `missing` naming the three ways to set one

#### Scenario: The instance is unreachable

- **WHEN** the configured instance refuses the connection, times out,
  answers with an error status, or answers with text that is not JSON
- **THEN** the verb SHALL return `failed` naming which of those it was

### Requirement: qsm-web searxng keeps warnings off stdout

qsm-web searxng SHALL carry every warning and diagnostic as a warning of its
outcome, never as result data, so a caller reading the data never receives
a diagnostic among the results.

#### Scenario: An engine is suspended

- **WHEN** one queried engine reports itself suspended while others succeed
- **THEN** the suspension notice SHALL be a warning of the outcome, and the
  data SHALL hold the successful engines' results

### Requirement: qsm-web searxng scopes a query

qsm-web searxng SHALL accept flags narrowing a query by engine list, category,
time range, result language, safesearch level, and result count, each
applied as a stricter restriction than the instance's default.

#### Scenario: Restricting to two engines

- **WHEN** a query is issued with an engine list naming two engines
- **THEN** the outcome data SHALL hold results only from those two engines

### Requirement: qsm-web searxng interactive setup writes instance config

qsm-web searxng SHALL offer interactive setup that prompts for the instance
URL and default engines, write the answers to the config file, and SHALL
NOT overwrite an existing one unless the user confirms.

#### Scenario: Setup run with an existing config

- **WHEN** interactive setup runs while a config file is already present,
  whatever that file holds
- **THEN** qsm-web searxng SHALL ask before replacing it and leave the file
  untouched if the user declines

### Requirement: qsm-web opensrc acquires a package spec

qsm-web opensrc SHALL accept a package spec (bare, scoped, registry-prefixed,
owner/repo, or version-pinned) and resolve it to a source directory
reused across repeat calls for the library.

#### Scenario: A bare package name

- **WHEN** the caller supplies a bare name
- **THEN** the source SHALL land in that library's location and stdout
  SHALL report the resolved version when determinable, `null` otherwise

#### Scenario: Version resolution against a project

- **WHEN** the caller passes a project alongside a spec the project
  declares
- **THEN** the resolved source SHALL match the version pinned in the
  project's dependencies and be marked exact; absent a pin or a project,
  it SHALL resolve to the latest version and be marked inexact

### Requirement: qsm-web opensrc acquires a raw address

qsm-web opensrc SHALL accept a raw repository address and clone it shallowly on
first use; a repeat call SHALL update the existing clone instead of
re-cloning.

#### Scenario: First fetch of an address

- **WHEN** the library has no existing source directory
- **THEN** qsm-web opensrc SHALL clone the address into the library's location

#### Scenario: Repeat fetch of an address

- **WHEN** the library already has a cloned source directory
- **THEN** qsm-web opensrc SHALL update it in place rather than clone again,
  keeping the tree and warning rather than failing on a non-fast-forward
  update

### Requirement: qsm-web opensrc refuses an ambiguous bare name

When a project is given and a requested bare name matches a declared
dependency only by its unscoped tail, qsm-web opensrc SHALL refuse the fetch and
name the correctly scoped dependency instead of fetching an unrelated
package of the same name.

#### Scenario: Bare name collides with a scoped dependency

- **WHEN** the project declares a scoped dependency whose tail equals the
  requested bare name
- **THEN** qsm-web opensrc SHALL return `failed` naming the full scoped
  dependency and fetch nothing

### Requirement: qsm-web opensrc output contract

Every successful `qsm-web opensrc get` run SHALL return one object as its outcome
data: library name, absolute path to its acquired source, original spec or
address given, resolved version or `null`, whether that version was
exact, and which acquisition path produced it.

#### Scenario: Successful spec fetch

- **WHEN** a package spec fetch succeeds
- **THEN** the outcome data SHALL be one object with all six fields

### Requirement: qsm-web opensrc failure behaviour

`qsm-web opensrc get` SHALL return no data when the target is missing, the
upstream resolver is missing or fails, the resolver reports a missing path,
or a clone fails. A missing target SHALL be `usage`; a resolver that is not
installed SHALL be `missing` naming the command that installs it; every
other failure SHALL be `failed`.

#### Scenario: No target given

- **WHEN** the caller runs the verb with no argument
- **THEN** it SHALL report `usage`, naming the missing argument

#### Scenario: A dependency fails

- **WHEN** the resolver is not installed
- **THEN** the verb SHALL report `missing` with the install command

#### Scenario: A clone fails

- **WHEN** the resolver exits non-zero or the repository address cannot be
  cloned
- **THEN** the verb SHALL report `failed` naming the failure and SHALL
  carry no result data

### Requirement: qsm-web drives a CLI browser for captures and scripted scrapes

qsm-web SHALL drive a CLI browser (shot-scraper) for a quick screenshot, a
JavaScript value read off a page, and a scripted scrape of a site the agent
holds a stored login for, as the rung between fetch and the full browser
tier, needing no container.

#### Scenario: A screenshot of a page

- **WHEN** an agent asks for a screenshot of a reachable address
- **THEN** the CLI browser SHALL capture it and report where the image
  landed

#### Scenario: A JavaScript value off a page with a stored login

- **WHEN** an agent evaluates a JavaScript expression against a page,
  passing a stored login
- **THEN** the page SHALL load already signed in and the expression's
  value SHALL be returned

#### Scenario: The instagram saved-collection scrape produces one JSONL record per post and resumes

- **WHEN** the instagram saved-collection recipe runs against a list of
  shortcodes
- **THEN** it SHALL append one JSONL record per post to the corpus, and a
  re-run SHALL skip the shortcodes already recorded rather than re-scrape
  them

#### Scenario: A 429 stops the run and the corpus stays append-only

- **WHEN** the site being scraped answers a request with a rate-limit
  status
- **THEN** the recipe SHALL stop rather than retry faster, and the corpus
  file SHALL keep every record already written

#### Scenario: shot-scraper missing

- **WHEN** `shot-scraper` is not on PATH
- **THEN** doctor SHALL report it unhealthy and name the install line

### Requirement: qsm-web browserbox isolated instances

qsm-web browserbox SHALL start, list, and stop isolated browser instances,
each with its own live-view address a human can watch. Starting SHALL
succeed unattended; a missing or unreachable container runtime SHALL fail
the start with a reported error, not a hang.

#### Scenario: Start and list an instance

- **WHEN** an agent starts a new instance
- **THEN** qsm-web browserbox SHALL report its name and live-view address, and
  it SHALL appear in the instance list

#### Scenario: Container runtime unavailable

- **WHEN** an agent starts an instance and the container runtime cannot be
  reached
- **THEN** qsm-web browserbox SHALL report `missing` with the cause and SHALL
  NOT leave a partially started instance

#### Scenario: Stop an instance

- **WHEN** an agent stops a running instance
- **THEN** it and its resources SHALL be removed from the instance list

### Requirement: qsm-web browserbox one-shot fetch

qsm-web browserbox SHALL fetch one address and return success, whether a wall
or captcha blocked it, the final address and status, and the requested
artifacts. An erroring fetch SHALL report the error kind and message as
`failed`, and SHALL NOT return a partial result as success.

#### Scenario: Ordinary page

- **WHEN** an agent fetches a reachable address with no wall
- **THEN** the result SHALL report success, no block, and the requested
  artifacts

#### Scenario: Fetch with no instance named

- **WHEN** a fetch starts an instance of its own rather than being given one
- **THEN** that instance SHALL be stopped once the result is reported,
  unless the caller asked for the tab to be kept

#### Scenario: Wall blocks the fetch

- **WHEN** the fetched page shows a captcha or bot-detection wall
- **THEN** the result SHALL report the block, its kind, and the final
  address and status reached

#### Scenario: Navigation error

- **WHEN** the target does not resolve or times out
- **THEN** qsm-web browserbox SHALL report `failed` with the error kind and
  message, and claim no artifacts captured

### Requirement: qsm-web browserbox runs a script against a page

qsm-web browserbox SHALL run one ordered script of page actions (at minimum:
navigate, fill, click, wait, extract, screenshot) against one tab,
returning per-step outcomes and a final result. On a step's failure it
SHALL stop there and report which step failed and why, rather than
continue on a page in an unknown state.

#### Scenario: Script completes

- **WHEN** every step of a script succeeds
- **THEN** qsm-web browserbox SHALL report each step's outcome and the final
  page state (address, title)

#### Scenario: A step fails partway

- **WHEN** a fill or click step targets an element that is not there
- **THEN** qsm-web browserbox SHALL stop before the next step and report the
  failed step's index and reason, and later steps SHALL NOT run

### Requirement: qsm-web browserbox human takeover on a wall

qsm-web browserbox SHALL let an agent pause a tab on a wall until a human
clears it through the live view, or a caller-set timeout elapses. While
one tab waits, other tabs and instances SHALL stay usable.

#### Scenario: Human clears the wall

- **WHEN** an agent arms takeover on a blocked tab and a human solves the
  challenge through the live view
- **THEN** qsm-web browserbox SHALL report the wait as resumed and the agent
  SHALL continue against the same tab and cookies

#### Scenario: Timeout with no human action

- **WHEN** no human clears the wall before the caller's timeout
- **THEN** qsm-web browserbox SHALL report `failed`, not a resumed state

### Requirement: The browser image follows its source

qsm-web browserbox SHALL label the image it builds with a hash of every file under the plugin's
`docker/` context, and before it starts an instance it SHALL build the image again when no image
exists or the label differs from the current hash, because an image built from older sources runs
an older driver that never answers the current one.

#### Scenario: The docker context changed

- **WHEN** a file under `docker/` changed since the image was built
- **THEN** `qsm-web browserbox start` SHALL build the image again before it starts the instance

#### Scenario: The image is current

- **WHEN** the image's label equals the hash of the current `docker/` context
- **THEN** `qsm-web browserbox start` SHALL start the instance without a build

### Requirement: Install places the one bin on PATH

Installing qsm-web SHALL place the one `qsm-web` command on PATH, needing no upstream service beyond
a reachable search instance, and SHALL read the plugin checkout from `QSM_MARKETPLACE`, since a
compiled command carries no image build context, and a verb that needs it SHALL report
`missing` naming `QSM_MARKETPLACE` when it is unset. Installing SHALL also ensure the automation
rung's CLI browser is present and run its browser download once it is, since that download is
idempotent upstream.

#### Scenario: Fresh install

- **WHEN** the install step completes
- **THEN** the `qsm-web` command SHALL be on PATH

#### Scenario: No container runtime

- **WHEN** neither docker nor podman is on PATH
- **THEN** the install step SHALL still succeed, reporting a suggestion that
  names both ways to install one, because only the browser rung needs a
  runtime and it builds its image on first use

### Requirement: Install provides Tavily and prints the steps only a person can take

Installing qsm-web SHALL install the Tavily CLI (`tvly`) when it is not on PATH, and Tavily's agent
skills at user level for Claude Code, and SHALL verify the skills are there afterwards, reporting
an error when the command succeeded and left them missing. Context7's setup is an interactive
sign-in, so installing SHALL print `npx ctx7 setup --claude` as a step for the person, and SHALL
print the storing of the Tavily API key through `qsm-secrets` likewise; it SHALL NOT run either.
A tool that is already present SHALL be reported as already.

#### Scenario: Tavily skills missing

- **WHEN** the Tavily skills are absent from the Claude home
- **THEN** install SHALL run the skills installer for every skill, Claude Code only, user level,
  without a prompt

#### Scenario: Context7 skill absent

- **WHEN** neither Context7 skill is in the Claude home
- **THEN** install SHALL report a suggestion naming `npx ctx7 setup --claude`

### Requirement: Doctor reports the bins and the upstream skills

Doctor SHALL report whether the `qsm-web` command is on PATH and responsive, not passing silently
when missing, and SHALL report the same for `shot-scraper`, the automation rung's CLI browser, and
for `tvly`, the Tavily CLI. Doctor SHALL also report whether Tavily's agent skills and the Context7
skill are present in the Claude home, each unhealthy when missing and naming the command that fixes
it. Doctor SHALL NOT start a browser instance or reach a search network.

#### Scenario: The bin missing

- **WHEN** the `qsm-web` command is not on PATH
- **THEN** doctor SHALL report it unhealthy

#### Scenario: Upstream skills missing

- **WHEN** the Tavily skills or the Context7 skill are absent
- **THEN** doctor SHALL fail and name the command that installs each

### Requirement: qsm-web ships the research loop and one skill per tool

The plugin SHALL ship a `web-ladder` skill that fires when a task needs something the internet
holds and runs one loop: searxng search (the harness's `WebSearch` when it fails), keyword rounds
up to three, Context7 for a library question, Tavily when the keywords will not come, one page in a
real browser, and the person when a wall will not clear. It SHALL say out loud each step it skips,
and SHALL refuse crawling and account actions. The plugin SHALL ship one skill per tool it owns:
`searxng` for the search instance, `browserbox` for the real browser and the takeover, and
`opensrc` for a library's source on disk. Context7's and Tavily's skills are the upstream ones,
installed as they are, never copied here.

#### Scenario: A question that one call answers

- **WHEN** a task asks for one page or one library's docs
- **THEN** the loop SHALL start at the matching step and SHALL NOT open the browser

#### Scenario: A wall

- **WHEN** a fetch reports `blocked`
- **THEN** the loop SHALL hand the tab to the person through takeover instead of retrying

#### Scenario: A library's source is needed

- **WHEN** the docs are silent and the behaviour must be read in code
- **THEN** the `opensrc` skill SHALL run `qsm-web opensrc get` at the version the project pins

### Requirement: qsm-web ships the web-research agent

The plugin SHALL ship a `web-research` agent that runs the loop away from the main context, handles
a captcha itself up to the takeover and the wait, stops at a login and reports the page, saves the
pages it relies on to files, and returns a short answer with sources.

#### Scenario: A takeover times out

- **WHEN** the wait ends without the person clearing the wall
- **THEN** the agent SHALL treat that page as lost, never open it again, and name it in the reply

### Requirement: qsm-web exposes its verbs to hooks

The plugin SHALL register the `$.web` noun in its hooks module, one method per verb that has a
JSON form, generated from `qsm.json`, and the hooks module SHALL hold no logic of its own.

#### Scenario: A verb added to qsm.json

- **WHEN** a verb is added to `qsm.json` and the generator runs
- **THEN** `$.web` SHALL carry a method for it and the generated contract SHALL match
