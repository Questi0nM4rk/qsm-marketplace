## Why

The maintainer needs an ordinary marketplace refresh to preserve helpers that plugins deliberately
install. Cleanup treats every checkout link as obsolete, so it removes `drive`, its installer
recreates it, and the final cleanup check rejects that supported installation.

## What Changes

- Declare checkout-local helper links once as `qsm.links` in the owning plugin's `qsm.json`.
  The shared install base creates those links and setup reads the same declarations before cleanup.
- Preserve only the exact declared bin name and resolved source pair. Keep removing undeclared
  checkout links, including obsolete links inside a plugin that still exists.
- Move qsm-compuse's `drive` link from its custom install step to that declaration. Do not change
  the helper's name, implementation or use.
- Keep dry-run, install's final check, relink and doctor on the same cleanup decision.
- Bootstrap qsm-setup through its existing installer in the canonical checkout before the normal
  post-merge refresh invokes it. The first refresh must not run cleanup from the installed old
  binary.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qsm-setup`: Shared installation and cleanup agree on declared checkout-local helper links.

## Impact

The shared manifest parser and install base, setup discovery and purge wiring, qsm-compuse's
manifest and installer, the normal refresh hook, and existing integration checks. No package
dependency, account,
persisted ownership registry, new CLI flag or command, hook bypass, server edit, or change to
SearXNG profiles. Existing external-tool and askpass links stay on their current paths.

The budget is one bounded installer fix, one integrated regression fixture and the required gates,
not a desktop-helper rewrite or a general installed-file manager. Implementation and live
installation both wait for approval of this proposal. Feedback task: `qsm-i1u.78`.

## Critiques

- **Devil's advocate:** Keeping every link into an active plugin would also retain obsolete CLIs.
  Addressed by matching both the declared name and exact normalized target, never a directory
  prefix. A missing source or conflicting declaration fails before destructive cleanup.
- **Future archaeologist:** A second ownership record could survive after the plugin drops its
  helper. Addressed by reading the current manifest on every call, with no persisted allowlist.
- **Scope sniper:** Migrating desktop control to a compiled CLI or covering every external
  symlink would delay the profile delivery without fixing this cleanup decision more directly.
  Addressed by limiting the declaration to existing checkout-local helpers and leaving their
  implementation and external-tool installations unchanged.
