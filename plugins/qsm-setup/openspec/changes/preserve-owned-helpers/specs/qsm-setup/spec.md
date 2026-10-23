## ADDED Requirements

### Requirement: Helper links have one explicit installation owner

A plugin SHALL declare checkout-local helper links in optional `qsm.links` in its `qsm.json`,
mapping each bin basename to a file path relative to the plugin root. The shared install base
SHALL install these links through its existing link and conflict handling, and setup SHALL read
the same declarations to decide which links are current. Helpers SHALL NOT become compiled-bin
declarations, generated CLI verbs or completion entries solely because they are declared links.
Absent declarations SHALL mean no checkout-local helpers, not an inferred directory exemption.

Invalid names, source paths escaping the plugin, missing source files, duplicate helper owners
or collisions with declared compiled bins SHALL fail before destructive cleanup. Failures SHALL
name the declaration and cause. Dry-run SHALL write nothing.

#### Scenario: Installing a declared helper

- **WHEN** a plugin declares a valid helper and its shared installer runs
- **THEN** the bin link SHALL point to the declared source and a second install SHALL leave it
  unchanged, without a second custom link declaration

#### Scenario: Rejecting an invalid owner

- **WHEN** a helper declaration escapes its plugin, names a missing source, or collides with
  another helper owner or compiled bin
- **THEN** setup SHALL fail naming the cause before removing any installed artifact

### Requirement: Refresh uses the setup implementation from the canonical checkout

The normal marketplace refresh hook SHALL bootstrap the compiled qsm-setup through its existing
plugin installer in the canonical checkout, inside the existing refresh lock, before calling
`qsm-setup install --all`. It SHALL stop on bootstrap failure and retain the existing failure log
and notification. It SHALL NOT disable Git hooks or refresh a worker's checkout. Plugin cache
updates SHALL remain after successful full installation.

#### Scenario: The installed setup predates a cleanup fix

- **WHEN** the canonical checkout is merged and the normal refresh starts
- **THEN** the checkout's setup installer SHALL complete before the full installation begins,
  so cleanup runs from the rebuilt CLI rather than the old process

#### Scenario: Setup cannot be bootstrapped

- **WHEN** the setup installer fails during refresh
- **THEN** full installation and cache updates SHALL NOT run, and the existing log and failure
  notification SHALL report the failure

## MODIFIED Requirements

### Requirement: Install and relink purge every older qsm artifact, before and after themselves

`qsm-setup install` and `qsm-setup relink` SHALL, before writing anything, remove every artifact an
older qsm version left on the machine, and SHALL name each removal in their output. The artifacts
are: the legacy bin farm `<data>/qsm/bin` when every entry in it is a symlink (removed by the shared
install base, which every plugin installer runs, and by the purge through the same function); every
`# qsm:` block that puts a directory on PATH in a fish `conf.d` file, `.zshenv` or `.zshrc`, the
comment line and the lines that follow it up to the next blank line; a recorded binary no plugin
declares any more; a symlink in the bin directory that points into the marketplace checkout and
does not match a current declared helper by both bin name and resolved target, or into a
`uv/tools/qsm-*` tool directory, together with that tool directory; and an empty plugin data
directory under the Claude config directory whose plugin the marketplace no longer lists. A
current helper SHALL be preserved even when installing a different plugin. A removed declaration
or a link under another name SHALL NOT preserve an obsolete checkout link.

The purge SHALL be idempotent: a second run removes nothing and says so. It SHALL write no `.bak`
or other backup of any file it edits. After `install` the purge SHALL run again in report-only mode,
and any artifact still found SHALL make the verb fail. `relink --check` SHALL report each obsolete
artifact as stale without removing it. Doctor SHALL FAIL, naming each obsolete artifact and
`qsm-setup relink` as the remedy, for every artifact the purge would remove, and SHALL FAIL when the
first `qsm-*` on PATH for a declared or built binary is not the installed binary in the bin
directory. Every test and tool that creates a temporary directory SHALL remove it.

#### Scenario: A machine holding every legacy artifact

- **WHEN** install or relink runs against a home that holds the legacy bin farm, a `# qsm:`
  PATH block in fish `conf.d`, `.zshenv` and `.zshrc`, an undeclared symlink into the checkout, a
  uv tool link, and empty data directories of absent plugins
- **THEN** each obsolete artifact SHALL be gone afterwards, each SHALL be named in the output,
  no backup file SHALL exist, and doctor SHALL then report no failure

#### Scenario: A second run

- **WHEN** install or relink runs again right after
- **THEN** nothing SHALL be removed and the output SHALL say the machine is clean

#### Scenario: Check mode

- **WHEN** relink runs with `--check` on a home holding a legacy farm
- **THEN** the farm SHALL still exist, the output SHALL name it, and the exit SHALL report stale

#### Scenario: A foreign file in the legacy farm

- **WHEN** `<data>/qsm/bin` holds a regular file
- **THEN** the purge SHALL leave the directory in place and doctor SHALL FAIL naming it

#### Scenario: A shadowing binary

- **WHEN** a directory earlier on PATH holds a `qsm-*` file under a declared binary's name
- **THEN** doctor SHALL FAIL naming that file and the installed one

#### Scenario: A current helper and an obsolete link in the same plugin

- **WHEN** the bin directory holds a correctly declared helper and an undeclared checkout link
  into the same active plugin
- **THEN** dry-run SHALL propose removing only the obsolete link, real install SHALL remove only
  that link, the final check SHALL accept the helper, and relink and doctor SHALL NOT report the
  helper as stale

#### Scenario: A plugin drops its helper declaration

- **WHEN** a checkout link remains in the bin directory after its helper declaration is removed
- **THEN** cleanup SHALL remove and name that obsolete link rather than infer ownership from
  the plugin's continued existence
