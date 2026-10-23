## Why

People and agents need one flag for a named source selection. Profile presets and server
categories currently select sources differently, so keeping both makes that choice ambiguous.

## What Changes

- Keep `--profile default|niche|academic|it` as the only named source-selection flag.
- Add the reviewed IT set of 36 public sources using the existing profile availability check.
- **BREAKING**: remove category input from the CLI, generated noun and search options without
  an alias. Retain `category` in returned result metadata.
- Keep manual `--engines`, exclusive with every profile, including supplied empty values.
- Preserve default behavior, filters, warnings and the shared catalog/search deadline.

## Capabilities

### Modified Capabilities

- `qsm-web`: named source selection and the policy flags accepted by SearXNG search.

## Impact

The change belongs to qsm-web's manifest, generated contracts, SearXNG library and CLI handler,
real-entry tests, README, USAGE and existing SearXNG skill. It adds no dependencies, abstraction,
server settings, account, access workaround or catalog restriction. Other tabs and the full
engine-catalog skill are outside this change. Model eval runs remain paused.

## Critiques

- Devil's advocate: a successful query does not prove general relevance. Addressed by treating IT
  as the approved broad technical-discovery set, not promising a relevance or freshness guarantee.
- Future archaeologist: removing input category could accidentally remove output metadata.
  Addressed by an explicit result-metadata requirement and real-entry assertion.
- Scope sniper: replacing the selection layer is unnecessary. Addressed by adding IT to the
  existing preset map and deleting only the category input path.
