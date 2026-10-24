## 1. Profile implementations

Each line is one `openai/gpt-6-luna#high` worker in its own worktree, based on the integrated
predecessor. Shared ownership is sequential, not concurrent. The common file set is
`plugins/qsm-web/lib/searxng.ts`, `qsm.json`, generated `hooks/noun.generated.ts` and
`types/index.d.ts`, `scripts/searxng.test.ts`, one independent reviewed-source fixture under
`scripts/fixtures/`, `skills/searxng/SKILL.md`, `README.md` and `USAGE.md`. Workers do not edit
tracker/spec planning state, merge, push or install. The main agent accepts the real-entry proof and
integrates each returned diff before the next starts.

- [x] 1.1 Add `images` with its exact 16-engine set across the common file set. Extend existing
      parameterized tests and establish the independently recorded fixture for new sets. Derive
      conflict/category-rejection coverage from all profile names so later additions need no copied
      loops. Proof: `mise exec -- bun test plugins/qsm-web/scripts/searxng.test.ts` shows exact
      source selection, disabled-default selection, missing-engine refusal, conflict/category
      rejection and preserved media fields. Blocks on spec approval.
- [x] 1.2 Add `videos` with its exact 12-engine set across the common file set and fixture. Keep
      result/media/iframe metadata without playback. Proof: the same real-entry suite includes
      Videos selection and refusal cases and retains existing result tests. Blocks on 1.1
      integration.
- [x] 1.3 Add `news` with all five specified engines, including `naver news`, across the common file
      set and fixture. Add one real-entry case returning useful links plus Naver diagnostics and
      verify the warning is preserved; preserve failed-empty behavior. Proof: the real-entry suite
      passes without retry or silent source removal. Blocks on 1.2 integration.
- [x] 1.4 Add `music` with `deezer`, `mixcloud`, `soundcloud` across the common file set and
      fixture. Teach catalog discovery rather than playback. Proof: the real-entry suite proves
      exact membership, preflight refusal and unchanged normalized results. Blocks on 1.3
      integration.
- [x] 1.5 Add `map` with `apple maps`, `photon` across the common file set and fixture. Teach
      place/geocoding links without adding routing, location access or result fields. Proof: the
      real-entry suite proves exact membership, preflight refusal and unchanged result shape. Blocks
      on 1.4 integration.
- [x] 1.6 Add `files` with `bt4g`, `openrepos` across the common file set and fixture. State narrow
      metadata coverage and no inferred reuse rights; add no download action or blanket protocol
      filter. Proof: the real-entry suite proves exact membership and refusal without executing a
      result link. Blocks on 1.5 integration.
- [x] 1.7 Add `social-media` with its exact nine-engine set, including `boardreader`, across the
      common file set and fixture. Teach mixed post/user/community/hashtag links without changing
      their normalized shape. Proof: the real-entry suite passes and CLI/noun/help expose
      `social-media`, not an alias. Blocks on 1.6 integration.

## 2. Integrated verification and review

- [x] 2.1 Regenerate and verify all generated surfaces once on the combined result; run
      `mise exec -- bun run validate`, `mise exec -- bun run lint`,
      `mise exec -- bun run typecheck`, `mise exec -- bun test ./ ./.gates`,
      `mise exec -- bun run test:hooks`, and the normal quality gate without threshold changes or
      waivers. Verify new fixture memberships against the delta spec and unchanged old source lists.
      Model eval runs stay paused, and unavailable `/simplify` is explicitly named rather than
      claimed. Blocks on 1.7.
- [x] 2.2 Compile the combined qsm-web binary and drive every added profile through the compiled
      entry against one loopback SearXNG-shaped fixture, including exact selection, source
      attribution, warnings and missing-engine/conflict/category failures. Do not replay provider
      challenges or treat local proof as new live-provider health evidence. Blocks on 2.1.
- [x] 2.3 Obtain one independent Luna-high review of the pinned combined diff against the proposal,
      design and delta spec; verify and address every supported finding and repeat the bounded
      review until zero findings. Blocks on 2.2.

## 3. Delivery and final test-it

- [x] 3.1 Merge the reviewed work through normal gates, push main, and refresh qsm-web through its
      supported install path after inspecting installation effects. Preserve unrelated tools and
      tracker records; an earlier one-merge post-merge waiver does not apply. Blocks on 2.3.
- [x] 3.2 Run the installed command's help and all seven profiles against the bounded loopback
      fixture, verify generated choice exposure and source/warning semantics, and record any safe
      optional live smoke check or explicit cooldown skip. No server setting is edited. Blocks on
      3.1.
- [x] 3.3 Fold the delta into the plugin-owned durable spec, archive this change, close its bound
      implementation and final test-it tasks with evidence, check the epic acceptance, and remove
      owned worktrees/branches without discarding unrelated changes. Blocks on 3.2.
