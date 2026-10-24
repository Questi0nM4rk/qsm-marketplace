## Context

qsm-web already implements named presets in `lib/searxng.ts`, a manifest-backed CLI, generated
noun/types, catalog preflight, one request deadline and stable normalized results. The independently
reviewed research in task `qsm-r7s7` supplies the new source sets. The owner chose the public name
`social-media` and explicitly included `naver news` despite its warning-bearing research result.

## Goals / Non-Goals

Goals: expose the seven reviewed jobs through the same command, teach selection in the existing
skill and consumer docs, and prove exact source selection and failure behavior through the real
entry point.

Non-goals: server or Preferences edits, provider repairs, catalog pruning, new keys/accounts, new
dependencies, a new registry framework, subprofiles, General/Science/Other presets, media playback
or file downloads. Model eval runs remain paused. This change does not port unrelated work or
installation settings.

## Decisions

1. Extend the current enum and `PROFILE_ENGINES` in place. The sets below are part of the delta
   spec, not a runtime configuration format. Reuse preflight, request builder, filters, normalized
   result fields, warning handling and the shared deadline unchanged. Reject a missing source rather
   than silently degrading the set.
2. Keep names `images`, `videos`, `news`, `music`, `map`, `files`, `social-media`. Preserve the
   existing four profile choices and their source lists. News includes `naver news` by the owner's
   decision; a source warning is not suppressed to make a preset look healthy.
3. Update `qsm.json` as the CLI contract, then regenerate `hooks/noun.generated.ts` and
   `types/index.d.ts`. Never edit generated files manually. Runtime validation and error text must
   recognize the same choices as help and the generated surface.
4. Extend the existing parameterized real-entry profile checks rather than create seven copied test
   suites. Expected new source sets come from one standalone test fixture recorded from the reviewed
   lists, not imported from production constants. All added profiles participate in exact-selection,
   missing-engine, conflict and removed-category checks. The real-entry warning scenario also covers
   `naver news`; representative media fields retain their existing shape.
5. One Luna-high agent owns each profile in a separate worktree, in this order: images, videos,
   news, music, map, files, social-media. Each starts from the integrated result of its predecessor.
   This serializes overlapping edits to the same registry, manifest, fixture, skill and docs without
   inventing per-agent product modules. The main agent owns integration, review, commits, push,
   installation and cleanup. A worker never merges, pushes, rebases or removes a worktree.
6. Each profile is taught in the current SearXNG skill table with its actual job and an example.
   Images are mixed image/icon/art/meme discovery, Videos are metadata links, News includes regional
   sources and does not guarantee freshness, Music is catalog discovery, Map is place/geocoding
   links rather than routing, Files is the narrow reviewed pair of indexes, and Social media mixes
   posts, users, communities and hashtags. No profile grants content reuse rights or causes
   playback/download. Keep instance details and research transcripts outside the public tree.

## Risks / Trade-offs

- One query does not establish universal relevance or future health: source attribution, warnings
  and fail-loud preflight remain visible; docs make no such promise.
- Some sources are region/language-specific or warning-prone: keep native behavior and user-supplied
  language/filter controls, with no new retry or translation behavior.
- Files has only `bt4g` and `openrepos`: describe its actual coverage and mixed-rights metadata, not
  a comprehensive file search or a licence guarantee.
- Profiles touch shared files: serial independent worktrees cost startup time but avoid parallel
  conflict rounds and unnecessary product abstractions.
- Existing provider cooldowns make a full live-provider replay inappropriate: test every new profile
  through compiled and installed real CLI entries against a loopback SearXNG-shaped fixture. Any
  additional live smoke check is bounded, explicitly recorded, and omitted rather than retried when
  a provider is restricted. The completed research is not relabelled as new health evidence.

## Delivery

Run the ordinary repository gates and the integrated real-entry checks, then one independent
Luna-high review of the complete change. Inspect normal installation effects before applying them;
do not reuse any earlier one-merge hook waiver or discard unrelated tools/tracker work. Merge and
push the reviewed change, refresh qsm-web through its supported install path, verify the installed
command, fold the delta into the plugin-owned durable spec and archive the completed change. No
server changes are part of delivery.

## Open Questions

None. Product names, memberships, Naver inclusion and server scope are settled. The implementation
waits for the owner's approval of these artifacts.
