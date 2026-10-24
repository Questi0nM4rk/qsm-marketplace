# qsm-web Specification

## Purpose

qsm-web owns web research: one loop, a skill for each tool it uses, and the CLI that drives them.

## Requirements

### Requirement: qsm-web searxng queries the configured instance

The `search` verb SHALL select its instance from `--instance`, then `QSM_SEARXNG_INSTANCE`, and
SHALL NOT read or write a client config file. It SHALL return one result array as its outcome
data, retaining URL, title, content, engine, engines, category, score and published date, with
optional `img_src`, `thumbnail_src` and `iframe_src` values when supplied.

#### Scenario: Server defaults are used without overrides

- **WHEN** a nonblank query is issued with an instance and no search-policy flags
- **THEN** the request SHALL contain only the query and JSON format parameters, leaving engine
  and other policy defaults to the server
- **AND** each result SHALL retain every supplying engine in its engines array

#### Scenario: Missing or invalid address

- **WHEN** neither address input is present
- **THEN** the verb SHALL return `missing` naming the two supported inputs
- **WHEN** an explicit address is not absolute HTTP(S) or contains credentials, query or fragment
- **THEN** the verb SHALL return `usage` without making a request or exposing those values

#### Scenario: Transport or response failure

- **WHEN** the instance is unreachable, times out, returns an HTTP error, non-JSON text or an
  invalid response shape
- **THEN** the verb SHALL return `failed` identifying the kind of failure without exposing the
  response body
- **AND** the response SHALL require a results array whose entries have nonblank URLs

#### Scenario: Images remain usable evidence

- **WHEN** an image result supplies an image URL and thumbnail URL
- **THEN** its outcome entry SHALL retain those values as `img_src` and `thumbnail_src` in
  addition to its source-page URL

### Requirement: qsm-web searxng keeps warnings off stdout

The search verb SHALL carry every engine diagnostic as an outcome warning, not as result data.
Text mode SHALL print one JSON result array to stdout and warnings to stderr. JSON mode SHALL
print one shared outcome envelope with the result array only in data and a short count message.

#### Scenario: An engine is suspended

- **WHEN** other engines return useful results while an engine reports an error, including
  Google CSE rate limiting
- **THEN** the verb SHALL succeed with those results and retain the warning without retrying or
  suppressing it

#### Scenario: No results and engine failures

- **WHEN** no results are returned and one or more engines report failures
- **THEN** the verb SHALL return `failed` and retain those warnings without claiming that every
  engine or the whole instance is down

#### Scenario: Legitimate empty result

- **WHEN** the response has an empty results array without reported engine failures
- **THEN** the verb SHALL succeed with an empty data array and a no-results warning

### Requirement: qsm-web searxng scopes a query

The verb SHALL accept explicit engine, time-range, language and safesearch overrides, but SHALL
NOT accept category input in its CLI, generated noun or search options. Result `category`
metadata SHALL remain unchanged. The local result-count ceiling SHALL default to 10 and the
transport timeout SHALL default to 10000 milliseconds, overridable with `--num-results` and
`--timeout`. Count and timeout SHALL be positive safe integers. Safesearch SHALL be 0, 1 or 2.
Query and language SHALL not be blank when supplied.

#### Scenario: Explicit overrides reach the server

- **WHEN** valid search-policy flags are given
- **THEN** their values SHALL be sent as server query parameters without adding other policy
  defaults
- **AND** `--engines ''` SHALL omit the engines parameter
- **AND** the client SHALL NOT send a category parameter

#### Scenario: Invalid explicit input

- **WHEN** a count, timeout, safesearch, query or supplied text filter violates its constraint
- **THEN** the verb SHALL return `usage` before making a request

#### Scenario: Category input is not supported

- **WHEN** a CLI caller supplies `--category`, alone or with a profile, including an empty value
- **THEN** the verb SHALL return `usage` before making any network request
- **AND** CLI help and the generated noun input SHALL NOT advertise category selection

#### Scenario: Result category remains available

- **WHEN** the server returns a source link with `category` metadata
- **THEN** the result SHALL retain that category value

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
  and SHALL report success only when the update succeeds

#### Scenario: Updating an existing source tree fails

- **WHEN** the update command fails, including a refused non-fast-forward update
- **THEN** qsm-web opensrc SHALL return `failed` without result data
- **AND** it SHALL retain the existing tree and name the failed update without guessing its cause

#### Scenario: A cached directory belongs to a different repository

- **WHEN** an existing source directory has a missing or different origin from the requested address
- **THEN** the verb SHALL fail before pulling or returning source data and retain the directory
- **AND** it SHALL name the cache conflict without printing the other origin or changing it
- **AND** repository URLs and SCP addresses SHALL match exactly, while local paths SHALL be resolved
  before comparison so repeating a relative local address still selects the same repository

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
exact, and which acquisition path produced it. Git progress and status text SHALL NOT reach stdout.

#### Scenario: Successful spec fetch

- **WHEN** a package spec fetch succeeds
- **THEN** the outcome data SHALL be one object with all six fields

#### Scenario: Git prints status text during a successful acquisition

- **WHEN** Git writes status or progress text while a clone or update succeeds
- **THEN** stdout SHALL still contain only the CLI result, or one outcome envelope with `--json`
- **AND** Git diagnostics SHALL be captured or directed to stderr, never mixed with the result

### Requirement: qsm-web opensrc failure behaviour

`qsm-web opensrc get` SHALL return no data when the target is missing, the
upstream resolver is missing or fails, the resolver reports a missing path,
or a clone or update fails. A missing target SHALL be `usage`; a resolver that is not
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
the start with a reported error, not a hang. Each instance SHALL run on the host's network, so
a page served on the host's loopback address is reachable from its browser, and its live view
SHALL listen on the loopback address only, on the instance's own port, so no other host can reach
the browser.

#### Scenario: Start and list an instance

- **WHEN** an agent starts a new instance
- **THEN** qsm-web browserbox SHALL report its name and live-view address, and
  it SHALL appear in the instance list

#### Scenario: A server on the host's loopback

- **WHEN** a page is served on the host's 127.0.0.1 and an agent fetches it with qsm-web browserbox
- **THEN** the fetch SHALL succeed and a requested screenshot SHALL show the page

#### Scenario: Container runtime unavailable

- **WHEN** an agent starts an instance and no supported container runtime executable is available
- **THEN** qsm-web browserbox SHALL report `missing` with the cause and SHALL
  NOT leave a partially started instance

#### Scenario: Listing instances fails

- **WHEN** the container runtime fails to list instances
- **THEN** the verb SHALL return `failed` rather than a successful empty list

#### Scenario: Stopping every instance fails

- **WHEN** removal of an instance fails during `stop --all`
- **THEN** the verb SHALL return `failed` naming that instance and the removal failure
- **AND** it SHALL NOT claim that every instance was stopped

#### Scenario: Failed startup cannot confirm cleanup

- **WHEN** a started browser does not become ready and its removal command fails
- **THEN** the verb SHALL return `failed` naming the instance and the removal failure
- **AND** it SHALL say that a leftover container needs checking, not that nothing is running

#### Scenario: Failed startup is cleaned up

- **WHEN** a started browser does not become ready and its removal command succeeds
- **THEN** the verb SHALL return `failed` for startup and state that its container was removed

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

### Requirement: An instance writes its artifacts as the invoking user

qsm-web browserbox SHALL start an instance as the invoking user's uid and gid, so no file it writes
to the mounted output directory is owned by another user, and it SHALL NOT delete anything from that
directory.

#### Scenario: Two captures, one earlier artifact

- **WHEN** two `--screenshot` fetches run one after the other
- **THEN** both SHALL succeed, every file they wrote SHALL be owned by the invoking user, and the
  first fetch's files SHALL still exist after the second

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

### Requirement: qsm-web searxng selects a named search profile

The search verb SHALL accept
`--profile default|niche|academic|it|images|videos|news|music|map|files|social-media` as its only
named source-selection flag. A profile SHALL affect only its query and SHALL NOT write server or
client configuration. Calls without a profile SHALL retain existing behavior except that category
input is unsupported. Profile selection SHALL preserve the existing result and warning contracts.

#### Scenario: The default profile follows the server

- **WHEN** a query selects `--profile default` without conflicting flags
- **THEN** the client SHALL omit engine and category overrides and SHALL NOT fetch the engine
  catalog
- **AND** other explicit search filters SHALL retain their existing behavior

#### Scenario: The niche profile searches personal websites and discussions

- **WHEN** a query selects `--profile niche` and all required engines are registered
- **THEN** the search request SHALL select exactly `searchmysite,wiby,mwmbl,boardreader` as engines
- **AND** the client SHALL NOT send a category parameter

#### Scenario: The academic profile searches publications

- **WHEN** a query selects `--profile academic` and all required engines are registered
- **THEN** the search request SHALL select exactly
  `arxiv,crossref,openalex,semantic scholar,pubmed,europepmc` as engines
- **AND** the client SHALL NOT send a category parameter

#### Scenario: The IT profile searches the reviewed technical sources

- **WHEN** a query selects `--profile it` and all required engines are registered
- **THEN** the request SHALL select exactly the union of these 36 engine names:
  - Packages: `alpine linux packages`, `cachy os packages`, `crates.io`, `hex`, `lib.rs`,
    `packagist`, `pkg.go.dev`, `pub.dev`, `voidlinux`.
  - Apps: `apple app store`, `fdroid`, `google play apps`.
  - Questions: `askubuntu`, `stackoverflow`, `superuser`.
  - Discussions: `caddy.community`, `discuss.python`, `hackernews`, `pi-hole.community`.
  - Repositories: `codeberg`, `gitea.com`, `github`, `gitlab`, `sourcehut`.
  - Software catalogs: `docker hub`, `free software directory`.
  - Documentation: `gentoo`, `mankier`, `mdn`, `microsoft learn`, `nixos wiki`.
  - Code reference: `hoogle`.
  - AI catalogs: `huggingface`, `huggingface datasets`, `huggingface spaces`.
  - Security: `national vulnerability database`.
- **AND** the client SHALL NOT send a category parameter or select any additional engine

#### Scenario: The images profile selects image and icon sources

- **WHEN** a query selects `--profile images` and all required engines are registered
- **THEN** the request SHALL select exactly `artic`, `artstation`, `brave.images`, `devicons`,
  `duckduckgo images`, `findthatmeme`, `flaticon`, `frinkiac`, `giphy`, `iconify`, `lucide`,
  `material icons`, `pinterest`, `public domain image archive`, `selfhst icons`, `uxwing`
- **AND** the existing image and thumbnail fields SHALL remain available without fetching the media

#### Scenario: The videos profile selects video discovery sources

- **WHEN** a query selects `--profile videos` and all required engines are registered
- **THEN** the request SHALL select exactly `360search videos`, `bilibili`, `brave.videos`,
  `dailymotion`, `duckduckgo videos`, `ina`, `media.ccc.de`, `mediathekviewweb`, `odysee`,
  `pixabay videos`, `sepiasearch`, `sogou videos`
- **AND** the existing iframe/media metadata fields SHALL remain available without playback

#### Scenario: The news profile includes the owner-selected regional source

- **WHEN** a query selects `--profile news` and all required engines are registered
- **THEN** the request SHALL select exactly `brave.news`, `duckduckgo news`, `il post`,
  `naver news`, `sogou wechat`
- **AND** a warning from `naver news` SHALL remain visible alongside useful returned results without
  retrying or silently removing the engine

#### Scenario: The music profile searches catalog metadata

- **WHEN** a query selects `--profile music` and all required engines are registered
- **THEN** the request SHALL select exactly `deezer`, `mixcloud`, `soundcloud`
- **AND** it SHALL retain the existing result-link contract without playback or media download

#### Scenario: The map profile searches places

- **WHEN** a query selects `--profile map` and all required engines are registered
- **THEN** the request SHALL select exactly `apple maps`, `photon`
- **AND** the normalized result contract SHALL stay unchanged without implicit user-location access
  or routing behavior

#### Scenario: The files profile selects the reviewed indexes

- **WHEN** a query selects `--profile files` and all required engines are registered
- **THEN** the request SHALL select exactly `bt4g`, `openrepos`
- **AND** it SHALL return the existing search metadata without opening magnet links, downloading
  files or claiming content reuse rights

#### Scenario: The social-media profile selects public social discovery sources

- **WHEN** a query selects `--profile social-media` and all required engines are registered
- **THEN** the request SHALL select exactly `9gag`, `boardreader`, `lemmy comments`,
  `lemmy communities`, `lemmy posts`, `lemmy users`, `mastodon hashtags`, `mastodon users`,
  `tootfinder`
- **AND** it SHALL preserve attribution and the existing normalized contract for post, user,
  community and hashtag result links

#### Scenario: A profile conflicts with an explicit selection

- **WHEN** any profile is combined with supplied `--engines`, including an empty value
- **THEN** the verb SHALL return `usage` before making any network request
- **AND** an unknown profile SHALL also return `usage` without making a request

### Requirement: qsm-web searxng checks targeted profile availability

Before sending any non-default named-profile search, the client SHALL read registered engine names
from the selected instance's `/config` endpoint. It SHALL require all profile engines to be
registered without requiring them to be default-enabled. It SHALL retain reverse-proxy path prefixes
and SHALL use one `--timeout` budget for the entire inventory and search exchange, including bodies.

#### Scenario: A profile engine is absent

- **WHEN** the catalog lacks any engine named by a targeted profile
- **THEN** the verb SHALL return `missing` naming the missing engines and SHALL NOT send a search
  request
- **AND** the client SHALL NOT drop missing names or substitute server defaults

#### Scenario: The catalog cannot be read

- **WHEN** the catalog endpoint fails, times out, returns non-JSON, or lacks a valid engine-name
  array
- **THEN** the verb SHALL return `failed` without sending a search request or exposing the body
- **AND** the client SHALL NOT retry or fall back to another selection

#### Scenario: Disabled defaults remain selectable

- **WHEN** the catalog includes a profile engine whose default-enabled state is false
- **THEN** the client SHALL still include that engine in the explicit profile search

#### Scenario: A provider fails after availability succeeds

- **WHEN** the search returns source links and engine diagnostics after a successful preflight
- **THEN** the verb SHALL return the links with warnings using its existing output contract
- **AND** an empty result with engine failures SHALL retain its existing failed outcome

### Requirement: qsm-web exposes and teaches the reviewed profile choices consistently

The CLI help, generated noun and types, runtime validation, SearXNG skill, README and USAGE SHALL
agree on the eleven supported profile names and the defined source sets. The skill and consumer
documentation SHALL describe the profiles' actual discovery jobs and relevant result limitations
without adding a new skill, a subprofile or a server-configuration workflow.

#### Scenario: A person or agent chooses a new profile

- **WHEN** a person reads search help or consumer docs, or an agent loads the SearXNG skill
- **THEN** all seven added choices and their jobs SHALL be discoverable with usable command examples
- **AND** documentation SHALL distinguish mixed image/icon discovery, regional news, catalog music,
  place links, narrow file indexes and mixed social result types without promising freshness,
  general coverage or reuse rights

#### Scenario: Existing selection boundaries stay intact

- **WHEN** callers use the existing four profiles, manual engines, filters or result metadata
- **THEN** their existing contracts SHALL remain unchanged
- **AND** `--category` SHALL remain rejected before network access, while result `category` metadata
  remains present
- **AND** no `general`, `science`, `other`, `social` or compatibility-alias profile SHALL be
  introduced
