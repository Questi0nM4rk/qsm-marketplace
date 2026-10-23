## Context

The owner and agents use qsm-web to discover existing public content with source links.
`--profile` already resolves fixed sets, checks `/config` and shares one deadline with the search.
Native category selection instead follows server settings and can add sources to explicit engines.

## Goals / Non-Goals

**Goals:** one named selection flag, an exact IT preset, unchanged result metadata and existing
profile failure behavior. The qsm-web plugin owns every changed contract.

**Non-Goals:** server defaults, services, accounts, challenge workarounds, remaining-tab review,
catalog pruning and the full per-engine usage skill. No paused model eval runs.

## Decisions

1. Keep `--profile`, rather than renaming existing presets to category or retaining two flags.
   `default` still delegates selection to the server. No compatibility alias is retained.
2. Add `it` to the existing enum and preset map. Its exact membership is in the delta spec.
   No separate resolver, configuration file or engine-count limit is needed.
3. Delete category input in `qsm.json`, the handler and `SearchOptions`, and delete the request
   mapping to `categories`. Regenerate the noun and types from the manifest. Keep output category.
4. Preserve profile/manual-engine conflict checks before normalization so even empty manual
   selections conflict. Reuse the catalog preflight, shared deadline and all-or-nothing membership.
5. Prove behavior through the existing CLI-entry fixture and a compiled command. Adjust current
   category cases rather than keeping obsolete success assertions. Update only affected docs and
   the existing skill. One independent reviewer checks the pinned diff after ordinary checks.

## Risks / Trade-offs

- Existing category callers fail. The deliberate usage error avoids silently selecting a different
  engine set. CLI help and the existing skill expose the supported profile names.
- A broad IT set includes specialist package and model catalogs. Selection is not a ranking,
  freshness or reliability guarantee. No extra subprofiles are introduced.
- Instances missing any of the 36 engines cannot run IT. A named `missing` outcome is preferable
  to silently weakening the reviewed set. Manual `--engines` remains available.

## Migration Plan

After approval, implement and test in this worktree, review, archive the spec change, merge and
push. Rebuild only qsm-web from main and verify installed help, removed-flag rejection and a bounded
IT query. Preserve unrelated tracker records and installed tools. Rollback is a code revert and
rebuild, not a server edit. No open product decisions remain.
