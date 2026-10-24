## Why

The owner and agent need the source sets already reviewed in research task `qsm-r7s7` selectable
without rebuilding engine lists by hand. The existing profile path already provides the required
availability checks and failure behavior; extending that path is smaller than adding another search
interface.

## What Changes

- Add `images`, `videos`, `news`, `music`, `map`, `files` and `social-media` to the existing
  `--profile` contract.
- Use the exact reviewed source sets. Include the owner's explicit `naver news` addition and
  preserve its diagnostics.
- Teach these jobs and their limits in the existing SearXNG skill, README and USAGE; regenerate the
  noun and types.
- Extend the existing real-entry checks to the added profiles and prove the integrated compiled and
  installed command.
- Keep `default`, `niche`, `academic`, `it`, manual engines, category-input rejection, filters,
  output fields, warnings and deadlines unchanged.

## Capabilities

### New Capabilities

### Modified Capabilities

- `qsm-web`: extend named search profiles and the availability requirement in the plugin-owned
  durable spec at `plugins/qsm-web/openspec/specs/qsm-web/spec.md`.

## Impact

The change is confined to qsm-web's existing registry, manifest, generated noun/types, real-entry
tests, skill, consumer docs and spec. It adds no dependency, binary, verb, configuration store,
server setting, subprofile or provider-repair mechanism. The owner requested one
`openai/gpt-6-luna#high` implementation agent per profile. Shared files are updated in sequence in
isolated worktrees, then verified together before main and installation.

## Critiques

- Devil's advocate: one successful query is not broad relevance or reliability proof. Addressed by
  documenting profile jobs, keeping source attribution and warnings, and not claiming availability
  or content reuse rights from membership. `naver news` is included by the owner's explicit
  decision, not by suppressing its warning.
- Future archaeologist: a caller must know why these names form a set. Addressed by explicit
  per-profile membership and scenarios in the delta spec, plus job descriptions in the existing
  skill/docs; private deployment evidence stays outside the public tree.
- Scope sniper: parallelizing seven edits to the same registry would add conflicts or tempt a new
  framework. Addressed by serial profile agents reusing the current path, one integrated review and
  verification, and no server work or new abstractions.
