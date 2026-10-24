## ADDED Requirements

### Requirement: The checker deadline terminates its owned process group

The existing checker runner SHALL start each checker in its own process group and terminate
that group when the outer deadline expires, including engine children started by a launcher.
It SHALL retain the existing deadline values and not-measured outcome. It SHALL NOT identify
processes for termination by executable name or terminate unrelated user processes.

#### Scenario: A timed-out launcher has a running engine child

- **WHEN** a checker launcher starts an engine child and the checker exceeds its outer deadline
- **THEN** the runner SHALL terminate the owned launcher and engine group, report not measured,
  and leave no running engine from that invocation after cleanup

### Requirement: Semgrep rule timeouts and fatal errors invalidate measurements

The Semgrep output reader SHALL reject a native rule `Timeout`, including one reported at warning
level with nonempty results, as an incomplete measurement. Fatal scan errors SHALL also reject
nonempty partial output. Counting and failure reporting SHALL use the same classification and
retain the native cause. Other warning kinds SHALL retain their existing treatment.

Incomplete scans SHALL produce no tally and SHALL NOT enter the result store. The existing gate
outcome rules SHALL apply: absent another worse checker, an unmeasured scan is blocked, never
passed or labelled as a new regression. Complete output at a findings exit code SHALL remain a
measured result.

#### Scenario: A timeout is labelled as a warning

- **WHEN** Semgrep returns findings and an error with type `Timeout` and level `warn`
- **THEN** the scan SHALL be not measured, the cause SHALL name the timeout, and no partial
  result SHALL be cached or compared as a valid count

#### Scenario: A fatal error accompanies findings

- **WHEN** Semgrep returns a fatal scan error alongside otherwise readable findings
- **THEN** the scan SHALL be not measured regardless of the result count

#### Scenario: Findings come from a completed scan

- **WHEN** Semgrep completes and returns findings at exit code 1 without a scan failure
- **THEN** those findings SHALL remain measured and subject to the existing comparison rule

### Requirement: Semgrep rule execution stays inside the checker deadline

The common Semgrep argument builder SHALL explicitly use `--timeout 0` to avoid a separate native
per-rule cutoff within the already bounded checker execution. The existing outer deadlines,
including 420 seconds at pre-push, SHALL remain unchanged and enforced. Reaching that deadline
SHALL report not measured and SHALL NOT store a score. The changed argv SHALL participate in the
existing store key so entries collected under the native default are not reused in this mode.
No rule, quality threshold, reference commit or engine-selection policy SHALL change.

#### Scenario: The rule needs more than the native default allows

- **WHEN** a rule exceeds the native default per-file budget but finishes within the outer deadline
- **THEN** Semgrep SHALL be allowed to finish rather than omit the rule's finding

#### Scenario: The whole checker exceeds its existing deadline

- **WHEN** the checker does not finish within its existing outer deadline
- **THEN** the existing timeout path SHALL stop the bounded run, report not measured and retain
  no score for it

#### Scenario: A partial result exists from the native default mode

- **WHEN** the result store holds a score collected without the explicit timeout argument
- **THEN** that entry SHALL NOT answer a scan using the new argv, without changing the baseline
  commit or manually deleting cache files
