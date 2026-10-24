## Why

The maintainer needs a push gate to compare completed scans, not different amounts of unfinished
analysis. A native Semgrep rule timed out on an unchanged file, but its warning was ignored and
the partial count was cached, making an existing finding appear to be a regression.

## What Changes

- Make the existing checker runner own a process group and terminate that group on its outer
  deadline. A native proof showed the launcher can exit while `semgrep-core` continues running.
- Treat native rule timeouts as not measured even when Semgrep labels them warnings and returns
  other findings. Treat fatal scan errors the same way regardless of the result count.
- Name the native cause and keep incomplete scans out of the existing result store.
- Use Semgrep's `--timeout 0` inside the existing bounded checker process. The existing outer
  deadlines remain, including the pre-push limit of 420 seconds. This removes the separate
  five-second rule cutoff, not the gate's deadline or any security rule.
- Let the existing argv-based store key distinguish this execution mode from partial scores
  collected with the native default. Do not clear a baseline or edit cached scores by hand.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qsm-langdev`: Semgrep timeouts cannot become comparable or cacheable quality measurements.

## Impact

The existing checker timeout handler, Semgrep parser/failure reporting and argv builder,
their focused regression checks,
and the plugin's spec and usage caveat. No OCR evaluation edit, rule suppression, quality-threshold
change, new setting, CLI flag, login, fallback policy, store schema or dependency. Task `qsm-i1u.79`
holds the diagnosis. Implementation waits for the person's approval.

## Critiques

- **Devil's advocate:** Removing a native cutoff could leave the engine running after its launcher
  is killed. The native proof confirmed this fault. Addressed by owning and terminating the
  checker process group before changing the inner cutoff. Failure to finish is blocked, never green.
- **Future archaeologist:** A smaller count could look like improved code. Addressed by one
  shared failure classification and a regression using the observed warning-shaped timeout.
- **Scope sniper:** Clearing caches or rewriting a harmless OCR regex hides the cause. Neither
  is in scope. The changed argv naturally selects a different measurement key.
