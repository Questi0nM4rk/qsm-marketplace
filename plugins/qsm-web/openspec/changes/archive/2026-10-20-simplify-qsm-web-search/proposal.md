## Why

The client silently overrides SearXNG's engine policy, and a config-file naming mismatch can make
a working server look empty. The agent needs one small, truthful search interface, not a second
place to configure the server.

## What Changes

- **BREAKING**: remove the search config-file reader, writer and interactive setup verb. Select
  the instance with `--instance` or `QSM_SEARXNG_INSTANCE` only.
- Send search policy parameters only when explicitly requested. Leave engine selection,
  language, safesearch and other server policy to SearXNG by default.
- Validate explicit flags and the HTTP/JSON response at their boundaries. Preserve useful
  search and media evidence in outcome data.
- Keep successful partial results and engine warnings together. Treat unusable or malformed
  responses as failures, not empty success.
- Align the manifest, generated noun, tests, documentation and skills with that one contract.
  Preserve the pending web-ladder partial-failure improvement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qsm-web`: server-owned search defaults, explicit request overrides, media evidence and truthful
  search outcomes. The durable specification is owned by
  `plugins/qsm-web/openspec/specs/qsm-web/spec.md`, not a duplicate root spec.

## Impact

Scope is `plugins/qsm-web` and its generated contract. No added dependency, server change, private
config edit, live audio test or model eval run. The existing client config file is left untouched
and no longer read. Useful browserbox, opensrc and upstream integrations remain; their independent
audit may identify separate bounded repairs.

## Critiques

- Devil's advocate: dropping config files removes persisted instance selection. Accepted because
  the user explicitly chose a flag/environment address and server-owned policy; do not silently
  migrate or read the old file.
- Future maintainer: an empty result is not necessarily an outage. The design must distinguish a
  legitimate empty result from an exhausted engine set using available response evidence.
- Scope sniper: do not build npm search, retry engines, duplicate upstream clients or rewrite
  working browser features. Repair only evidenced defects in this slice.
