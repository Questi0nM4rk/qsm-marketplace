## Context

`linkBin` in `lib/install-base.ts` deliberately installs helper links. qsm-compuse calls it from
an extra step to create `drive`. Setup's `oldLink` instead treats every bin link into the checkout
as obsolete. Install purges before running plugin installers and checks for leftovers afterwards,
so a supported helper is removed, recreated, then reported as a leftover. Relink can delete it
without running the owning installer.

The normal refresh hook invokes the installed qsm-setup binary. Rebuilding that binary midway
through an old process does not replace the cleanup code already running in memory.

## Goals / Non-Goals

**Goals:** One declaration controls creation and preservation. Preserve only exact current
helper links, retain existing obsolete-link cleanup, and make the first ordinary refresh use the
correct setup implementation.

**Non-Goals:** Rewriting `drive`, adding commands or a helper registry, changing upstream-tool
links or askpass dispatch links, changing profile memberships, disabling hooks, activating user
settings, or modifying SearXNG server settings.

## Decisions

### One manifest declaration, not an inferred owner

Add optional `qsm.links`, a map of bin basenames to source files relative to the owning plugin.
qsm-compuse declares:

```json
{"qsm":{"links":{"drive":"scripts/drive"},"commands":{}}}
```

`lib/qsm-manifest.ts` owns parsing and validation. Names are nonempty basenames, sources are
nonempty relative paths confined to the owning plugin, and each source must exist as a file
before installation or cleanup mutates the machine. Setup rejects duplicate helper ownership or
collisions with declared compiled bins across the discovered catalog before purging.

The shared install base resolves this map and calls its existing `linkBin` in both plan and run.
qsm-compuse removes its duplicate custom link step. Setup discovery reads the same map through
the existing manifest contract, passes resolved name/target pairs to purge, and preserves a link
only when both match. No plugin imports another plugin's implementation.

Helper declarations do not become compiled CLI declarations, completions, noun methods or build
hash records. Existing `qsm.bin` behavior stays unchanged. Other `linkBin` callers point outside
the checkout or use relative executable dispatch and need no migration for this bug.

Alternatives rejected: a hardcoded `drive` exception duplicates ownership, a directory exemption
retains retired CLIs, a persisted registry drifts after source changes, and executing every
installer to discover ownership adds work and side effects before cleanup.

### Keep every purge caller on one rule

`PluginNode` carries the optional helper map. `purgeMachine` supplies all discovered declarations,
not only plugins selected for installation, so installing an unrelated plugin preserves an
existing helper. Install's initial purge, final check, relink and doctor keep using `purge`.
An undeclared checkout link remains removable even inside an active plugin. Foreign files and
links outside existing cleanup ownership remain untouched and existing `linkBin` conflict rules
remain in force.

### Bootstrap before normal refresh

Inside the refresh hook's existing lock, run qsm-setup's existing plugin installer from the
canonical checkout before invoking the installed `qsm-setup install --all`. Setup's installer
validates the whole discovered helper catalog before its shared base can clean any artifact.
This uses installation
code only to establish the compiled CLI, not a source-mode replacement for the CLI. A bootstrap
failure stops refresh and uses the existing log and failure notification. Plugin cache updates
remain after successful installation. Worktree refresh protection, pre-commit and pre-push stay
unchanged. No one-time hook exception is needed.

## Risks / Trade-offs

- **An overbroad exemption hides obsolete links:** Match exact names and normalized targets,
  verify declared source files, and prove an undeclared link in the same plugin is removed.
- **Declarations collide or escape their plugin:** Fail validation before destructive work.
  Do not choose an owner by iteration order or fall back to keeping all links.
- **Bootstrap costs an extra setup build:** Accept this small bounded cost so the process doing
  destructive cleanup always comes from the checkout being installed. Do not redesign refresh.

## Proof and Delivery

Extend the existing setup CLI integration suite with one sandboxed regression flow using the
real shared installer: dry-run, `install --all`, second install, and `relink --check`. Include an
exact helper, a stale checkout link in that same plugin and a foreign link. Reuse existing parser
checks for invalid declarations rather than making a parallel test suite. Exercise refresh order
and bootstrap failure with isolated command stubs, not a live full-machine refresh during tests.

After approval, implementation, ordinary gates and independent review, merge the installer fix
first through the normal hook and inspect its completed log. Stop if refresh fails. Only then
resume the already reviewed SearXNG profile merge and its installed smoke proof. A revert removes
the manifest feature and its consumers together. Never revert only the cleanup half.

## Open Questions

No product decision remains. The person must approve this design, including the bootstrap hook
change, before implementation or any live installation.
