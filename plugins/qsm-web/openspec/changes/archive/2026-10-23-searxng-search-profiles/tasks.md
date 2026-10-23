## 1. CLI profiles

- [x] 1.1 Add the manifest flag, profile validation and fixed selections to the existing SearXNG
  handler/library, including preflight availability and a shared request deadline. Verify through
  `scripts/searxng.test.ts` before moving to documentation.
- [x] 1.2 Regenerate noun/types and update existing README, USAGE and SearXNG skill with profile
  choices, memberships and failure behavior. Verify generated output and CLI help.

## 2. Acceptance and delivery

- [x] 2.1 Run ordinary validation, lint, typecheck, tests and hook tests. Keep model evals paused
  under the existing hold. Obtain a strict review and address verified findings.
- [x] 2.2 Run compiled CLI searches using default, niche and academic against the real instance.
  Verify engine attribution, preserve diagnostics without retries, and save private evidence
  outside the repository.
- [x] 2.3 Verify that the deltas describe the delivered behavior and that tracked files contain no
  private instance data, then prepare the change for archive. Final merge, installation and task
  closure are delivery checks in the task tool, not prerequisites for archiving this checklist.
