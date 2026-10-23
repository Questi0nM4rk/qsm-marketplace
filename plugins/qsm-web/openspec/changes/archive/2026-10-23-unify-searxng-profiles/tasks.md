## 1. Unify named source selection

- [x] 1.1 Update `qsm.json`, `lib/searxng.ts` and `scripts/searxng.ts` to add the exact IT
  membership and remove category input. Regenerate `hooks/noun.generated.ts` and `types/index.d.ts`.
  In `scripts/searxng.test.ts`, run the real CLI entry to prove exact IT selection, no categories,
  missing-engine failure, removed-flag rejection before network access and retained result category.
  Preserve checks for other profiles, empty-engine conflicts, warnings and the shared deadline.
- [x] 1.2 After 1.1, update `README.md`, `USAGE.md` and `skills/searxng/SKILL.md` to match the
  single-flag surface and IT membership. Verify help and generated contracts expose the same choices
  and category is absent from accepted inputs. Do not run paused model evals.

## 2. Verify and deliver

- [x] 2.1 After 1.2, run validation, lint, typecheck, ordinary tests and hook tests. Compile
  qsm-web and run bounded acceptance queries. Verify attribution stays inside the selected set and
  warnings remain visible. Record any unavailable checks without weakening them.
- [x] 2.2 Obtain one bounded independent review of the pinned diff, fix confirmed findings and
  rerun affected checks. Confirm the ordinary checks in 2.1 are green before accepting the review.

Delivery is verified by the epic's final test task, `qsm-96bh.2`: archive the completed spec, merge
and push, rebuild only qsm-web from main, verify installed help, category rejection and IT
selection, then remove the owned worktree. Preserve unrelated tracker changes. The owner approved
omitting only the full-plugin post-merge refresh for this merge, with pre-commit and pre-push gates
retained.
