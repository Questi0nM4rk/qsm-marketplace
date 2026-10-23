## Why

People and agents repeat engine lists when switching between everyday search, personal websites
and discussions, and academic publications. Named profiles make those choices explicit without
changing a SearXNG server's defaults.

## What Changes

- Add `--profile default|niche|academic` to `qsm-web searxng search`.
- Keep calls without a profile and the `default` profile on server defaults.
- Translate the two targeted profiles into fixed engine lists, without adding a category.
- Reject profile and explicit engine/category combinations before any request.
- Check the instance's registered engines before a targeted search. Refuse missing engines instead
  of silently widening the search.
- Document profiles in CLI help, usage documentation, and the existing SearXNG skill.

## Capabilities

### Modified Capabilities

- `qsm-web`: named, per-query SearXNG engine profiles with availability checks.

## Impact

The command manifest, SearXNG handler and library, generated noun/types, CLI tests, and existing
documentation change. There are no new dependencies, configuration files, server writes, private
instance addresses, account setup, or changes to result/warning output contracts.

## Critiques

- Devil's advocate: an unknown engine list can cause SearXNG to use unrelated defaults. Fixed by
  checking registered names before sending a targeted search.
- Future archaeologist: `default` could look like a frozen list. Fixed by defining it as the
  current server selection, identical to omitting the profile.
- Scope sniper: a configurable profile manager would exceed the request. Omitted in favor of
  three built-in choices and the existing `--engines` escape hatch.
