## Context

The preserved reference scan contains a warning-shaped `Timeout` for the same rule/file whose
finding appears in the current scan. The file's Git blob is identical. `countSemgrep` ignores
warning-level errors and accepts partial output with results. `ResultStore` then treats that
partial tally as a valid measurement.

A bounded native proof also found that `spawnAsync` kills only Semgrep's launcher on timeout.
The compare call returns not measured, but `semgrep-core` survives past the deadline. The guard
must be fixed before relying on it without a native per-rule cutoff.

The registry already bounds the whole checker run. Semgrep also defaults to a separate
five-second limit per rule and file, then can skip a file after repeated rule timeouts. The
[upstream CLI reference][cli]
and installed CLI help document that `--timeout 0` removes that inner cutoff.

[cli]: https://github.com/semgrep/semgrep-docs/blob/main/docs/snippets/cli-reference/help-ci.mdx

## Goals / Non-Goals

**Goals:** Bound the whole owned checker process group. Do not compare or cache timed-out or
failed rule execution. Report failure honestly and let a rule finish within the existing checker
deadline rather than silently omit it.

**Non-Goals:** Editing OCR code, suppressing findings, changing quality thresholds or the outer
deadlines, adding a retry loop, changing engine fallback policy, deleting a baseline, or building
a new cache or process manager.

## Decisions

- In the existing `spawnAsync` in `lib/compare.ts`, start each checker as the leader of its own
  process group. On timeout, terminate that owned group rather than only the launcher. Preserve
  existing deadline values and not-measured outcomes. Never kill by process name or touch other
  user processes. This is a change to the current runner, not a new process-manager module.
- In `lib/findings.ts`, share the classification of native Semgrep failures between counting
  and cause reporting. A `Timeout` is a failure despite `level: warn`. Fatal error-level entries
  also invalidate a scan that returned findings. Other warning kinds retain their existing
  treatment. This is not a redesign of parsing-coverage policy.
- Return no tally for an incomplete scan. Existing compare/store behavior then reports not
  measured, preserves the native cause, blocks an otherwise passing gate, and stores no score.
- Only after the process-group proof passes, add `--timeout 0` to the common Semgrep argv builder
  in `lib/registry.ts`, covering commit
  and push modes and both existing engines. Retain every existing outer deadline and rule pack.
  This is not an unbounded standalone Semgrep command.
- Use the existing argv-based configuration hash. The execution-mode change makes old partial
  Semgrep entries ineligible without deleting cache files, changing the reference commit or
  invalidating unrelated checker results.

## Risks / Trade-offs

- **A difficult rule takes longer:** The checker group still has its existing deadline, including
  420 seconds at pre-push. Replay the same bounded native proof and assert the engine no longer
  survives the timeout. Do not remove the inner cutoff until that proof passes.
- **A completed scan exposes an existing finding:** Score both sides with the same packs and
  execution mode. Never rewrite unrelated source merely to reduce the count.
- **The repository still cannot complete within its deadline:** Report blocked, not worse or
  passed. This fix does not promise a successful push before the real run completes.

## Proof and Delivery

Extend the existing runner timeout check to cover its child process and replay the native engine
proof. Use the preserved native timeout shape in the existing parser checks and one comparison
flow to prove not measured, native cause and no cached partial result. Preserve complete-scan
findings at exit 1. Extend existing argv/deadline checks, not a copied suite. Run one bounded
native comparison using the new mode, ordinary gates and independent review. Stop if it remains
blocked. After separate approval of deployment, use the normal merge/refresh/push path and only
then resume the installer/profile delivery. No allow variable or hook bypass is part of this plan.
