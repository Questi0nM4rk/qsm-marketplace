## MODIFIED Requirements

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

The verb SHALL accept explicit engine, category, time-range, language and safesearch overrides.
The local result-count ceiling SHALL default to 10 and the transport timeout SHALL default to
10000 milliseconds, overridable with `--num-results` and `--timeout`. Count and timeout SHALL be
positive safe integers. Safesearch SHALL be 0, 1 or 2. Query, category and language SHALL not be
blank when supplied.

#### Scenario: Explicit overrides reach the server

- **WHEN** valid search-policy flags are given
- **THEN** their values SHALL be sent as server query parameters without adding other policy
  defaults
- **AND** `--engines ''` SHALL omit the engines parameter

#### Scenario: Invalid explicit input

- **WHEN** a count, timeout, safesearch, query or supplied text filter violates its constraint
- **THEN** the verb SHALL return `usage` before making a request

## REMOVED Requirements

### Requirement: qsm-web searxng interactive setup writes instance config

**Reason**: Server policy belongs to SearXNG; a second client configuration silently diverges
from it.

**Migration**: Select the address with `QSM_SEARXNG_INSTANCE` or `--instance`; use explicit request
flags for overrides. Remove the setup verb and config code without reading, rewriting or deleting
personal files.
