## 1. The sentence

- [x] 1.1 Rewrite `GUIDE` in `lib/cockpit.ts` with `does`, `output`, `tools`, `skills`, `next` per
  stage and `guideText` as one sentence; update the cockpit tests that read the answer, and add
  one that each named skill exists as `plugins/<plugin>/skills/<skill>/SKILL.md`. Owns
  `lib/cockpit.ts` and its test. Proof: `bun test plugins/qsm-cockpit` passes and prints the six
  answers with their byte counts.
- [ ] 1.2 Live check: in a session, call the stage tool for LOAD, EXECUTE, VERIFY, EXECUTE, VERIFY
  and read each answer. Blocked by 1.1 and by the post-merge reinstall. Proof: the five answers and
  their bytes, one line each.
