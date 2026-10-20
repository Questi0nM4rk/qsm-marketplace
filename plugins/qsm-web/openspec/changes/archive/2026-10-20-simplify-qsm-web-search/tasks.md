## 1. Search contract

- [x] 1.1 Remove client config/setup and hardcoded server policy from `lib/searxng.ts`,
  `scripts/searxng.ts` and their manifest/callers; prove only explicit policy flags reach a local
  HTTP fixture.
- [x] 1.2 Validate inputs and response shapes, retain media URLs, preserve partial warnings and
  distinguish unusable empty responses; prove CLI failure/output scenarios against fixtures.

## 2. Integration

- [x] 2.1 Align the durable plugin spec, README, INSTALL, USAGE, doctor, searxng skill and generated
  noun/types. Include the preserved web-ladder Google CSE partial-failure rule, without running
  paused model evals.
- [x] 2.2 Replace obsolete config/setup tests with real CLI integration coverage and run all
  qsm-web tests plus repository validation, lint, typecheck, ordinary tests and hooks tests.

## 3. Acceptance

- [x] 3.1 Run full selected langdev checkers, including Oxc, lizard and sentrux, against the
  unchanged reference. Fix regressions without changing limits, disabling checkers or bypassing
  hooks. Record measurements and any unmet prerequisites.
- [x] 3.2 Run bounded live text, image, Stack Overflow and npm checks with explicit instance
  selection. View one returned public image, never upload a private screenshot, and report
  upstream limitations without treating them as success. No audio test.
- [x] 3.3 Have an independent requested-model reviewer check the integrated diff, verify its
  findings, resolve confirmed defects and report remaining limitations. Integrate only after
  acceptance gates pass.
