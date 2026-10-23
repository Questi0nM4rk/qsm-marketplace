## Context

The search handler validates CLI flags and the existing library builds one SearXNG request.
SearXNG combines explicit engines and categories additively, and an entirely unknown engine list
can select server defaults. A profile must therefore preserve its intended scope explicitly.

## Goals / Non-Goals

Provide three fixed per-query choices through the existing command and outcome contract. Keep
instance selection, explicit search without a profile, result formatting, and warnings unchanged.
Do not add a configuration file, a profile manager, server writes, cached engine inventories,
private addresses, or dependencies.

## Decisions

- Declare `--profile` choices in `qsm.json` and regenerate the noun and types. Keep profile lists
  and availability handling in the existing `lib/searxng.ts`, rather than adding another module.
- `default` sends no engine or category override and performs no availability lookup. Omitting
  the flag preserves existing behavior.
- `niche` selects `searchmysite`, `wiby`, `mwmbl`, and `boardreader`.
- `academic` selects `arxiv`, `crossref`, `openalex`, `semantic scholar`, `pubmed`, and `europepmc`.
- Reject any supplied `--engines` or `--category` with a profile, including empty values, before
  network access. Existing combinations without a profile retain their current behavior.
- Before a targeted search, read the instance's `/config` engine names. Require every listed
  engine to be registered, regardless of its default-enabled state. Missing names produce a
  `missing` outcome and no search request. A failed or unreadable inventory produces `failed`
  without printing response bodies. Do not drop names or retry on failure.
- One existing `--timeout` budget covers inventory and search, including response bodies. Keep
  reverse-proxy path prefixes for both endpoints.

## Risks / Trade-offs

- A targeted profile adds an inventory request. This prevents accidental broad searches and needs
  no persistent state. An instance without readable `/config` cannot use targeted profiles.
- Provider outages remain possible after registration checks. Preserve normal partial-result
  warnings and failure handling rather than treating registration as a health guarantee.
- Fixed lists cannot satisfy every instance. Keep `--engines` as the explicit alternative rather
  than adding configurable profiles.

## Verification

Run the real CLI against local HTTP fixtures to observe requested paths, engine parameters,
preflight failures, conflict rejection, and shared timeout behavior. Then run the compiled CLI
against the configured real instance with each profile and inspect attribution and warnings.
Keep real-instance addresses and reports outside the repository. Respect the existing model-eval
hold and run ordinary code checks instead.
