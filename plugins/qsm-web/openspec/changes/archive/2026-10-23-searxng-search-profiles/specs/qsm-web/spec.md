## ADDED Requirements

### Requirement: qsm-web searxng selects a named search profile

The search verb SHALL accept `--profile default|niche|academic`. A profile SHALL affect only its
query and SHALL NOT write server or client configuration. Calls without a profile SHALL retain
existing behavior. Profile selection SHALL preserve the existing result and warning contracts.

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

#### Scenario: A profile conflicts with an explicit selection

- **WHEN** a profile is combined with supplied `--engines` or `--category`, including empty values
- **THEN** the verb SHALL return `usage` before making any network request
- **AND** an unknown profile SHALL also return `usage` without making a request

### Requirement: qsm-web searxng checks targeted profile availability

Before sending a niche or academic search, the client SHALL read registered engine names from
the selected instance's `/config` endpoint. It SHALL require all profile engines to be registered
without requiring them to be default-enabled. It SHALL retain reverse-proxy path prefixes and
SHALL use one `--timeout` budget for the entire inventory and search exchange, including bodies.

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
