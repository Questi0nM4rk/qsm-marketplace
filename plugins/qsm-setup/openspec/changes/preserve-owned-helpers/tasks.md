## 1. Shared helper ownership

- [x] 1.1 After owner approval, add optional `qsm.links` parsing and validation in
      `lib/qsm-manifest.ts`, and consume it in `lib/install-base.ts` for dry-run and real link
      installation. Reuse existing parser checks for invalid declarations. Proof: existing
      manifest/install-base checks plus a declared helper plan and idempotent install. No new
      registry or framework. Blocks on approval.
- [x] 1.2 Carry declarations through `plugins/qsm-setup/lib/discover.ts` and
      `scripts/root.ts` into `lib/purge.ts`. Validate catalog collisions before cleanup and
      preserve only exact declared names and resolved targets in every purge caller. Move
      qsm-compuse's custom step into its `qsm.json` declaration and simplify its installer.
      Proof: one regression flow in the existing setup CLI suite drives dry-run, real
      `install --all`, a second install and `relink --check` in a sandbox, preserving the helper
      and foreign link while removing a stale checkout link in the same active plugin. Include
      the declaration-removal transition without a copied suite. Blocks on 1.1.

## 2. Safe normal refresh

- [x] 2.1 Add setup's own installer bootstrap inside the existing lock in `hooks/post-commit`
      (shared by post-merge and post-rewrite) before full installation. Preserve the
      canonical-checkout guard, failure propagation,
      cache update order and existing pre-commit/pre-push controls. Proof: a bounded isolated
      hook harness observes bootstrap before full install and no install/cache update after a
      failing bootstrap. Prove catalog validation precedes bootstrap cleanup using the existing
      regression flow. No live machine refresh during this test. Blocks on 1.2.
- [x] 2.2 Update only affected setup install/usage documentation and the compuse installation
      description if its mechanism is documented there. Run strict OpenSpec validation,
      validate/lint/typecheck, the existing ordinary and hook gates and quality comparison once
      on the combined result. Obtain independent strict review and resolve supported findings.
      Model evals remain paused. Name unavailable `/simplify` as skipped. Blocks on 2.1.
- [ ] 2.3 After approval of live installation, merge through normal gates and observe the normal
      refresh log through completion. Verify the declared helper target survives, obsolete links
      remain absent and no helper leftover failure occurs. Preserve unrelated tracker work and
      tools. Stop on refresh failure, do not waive checks. Sync/archive the delta and close
      `qsm-i1u.78` with evidence, then resume the separate reviewed SearXNG delivery. Blocks on 2.2.
