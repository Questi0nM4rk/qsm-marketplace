## 1. Bound and measure checker execution

- [x] 1.1 After owner approval of the revised design, change only the existing checker timeout
      path in `lib/compare.ts` to own and terminate a process group. Extend its existing timeout
      check to cover an engine child. Replay the same bounded native Semgrep proof and verify
      no owned engine survives. No killing by executable name or unrelated process cleanup.
- [x] 1.2 Update `lib/findings.ts` so counting and failure reporting share
      timeout/fatal-error classification. Prove the observed warning-shaped timeout with results
      is not measured or cached using the existing parser/comparison checks. Complete exit-1
      findings must still count. No OCR edit, copied suite or change to other warning policy.
      Blocks on 1.1.
- [x] 1.3 Add explicit `--timeout 0` in the existing common Semgrep argv builder in
      `lib/registry.ts`. Keep every outer deadline and rule pack unchanged. Extend existing argv
      and deadline checks to prove bounded failure and the existing key distinguishes the mode.
      Blocks on the bounded process-group proof and 1.2.

## 2. Verify and resume delivery

- [x] 2.1 Update only the affected usage caveat. Run one bounded native comparison, strict
      OpenSpec validation, required ordinary/hook gates and quality checks. Obtain independent
      review. Record complete versus blocked honestly, with no threshold waiver, cache deletion,
      repeated blind retry or paused model eval. Blocks on 1.3.
- [ ] 2.2 After approval of live deployment and green review/gates, merge through normal hooks,
      verify refresh and retry the original push through pre-push. Stop on failure. Sync/archive
      this delta and close `qsm-i1u.79` only with the result. Then resume the separately approved
      installer/profile delivery. Preserve unrelated dirty work. Blocks on 2.1.
