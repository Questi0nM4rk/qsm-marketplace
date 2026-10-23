## MODIFIED Requirements

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

### Requirement: qsm-web searxng selects a named search profile

The search verb SHALL accept `--profile default|niche|academic|it` as its only named
source-selection flag. A profile SHALL affect only its query and SHALL NOT write server or client
configuration. Calls without a profile SHALL retain existing behavior except that category input
is unsupported. Profile selection SHALL preserve the existing result and warning contracts.

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

#### Scenario: A profile conflicts with an explicit selection

- **WHEN** any profile is combined with supplied `--engines`, including an empty value
- **THEN** the verb SHALL return `usage` before making any network request
- **AND** an unknown profile SHALL also return `usage` without making a request

### Requirement: qsm-web searxng checks targeted profile availability

Before sending a niche, academic or IT search, the client SHALL read registered engine names
from the selected instance's `/config` endpoint. It SHALL require all profile engines to be
registered without requiring them to be default-enabled. It SHALL retain reverse-proxy path
prefixes and SHALL use one `--timeout` budget for the entire inventory and search exchange,
including bodies.

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
