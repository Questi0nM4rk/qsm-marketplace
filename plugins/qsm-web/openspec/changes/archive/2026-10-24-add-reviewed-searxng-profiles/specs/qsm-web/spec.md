## MODIFIED Requirements

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

## ADDED Requirements

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
