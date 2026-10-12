Every slice is test first: the scenario titles it names are written as bun `test("…")` titles byte
for byte, watched failing, then made to pass. Every slice ends with `bun run validate`, `bun run
lint`, `bun run typecheck`, `bun test` and `bun run test:hooks` green. Paths are under
`plugins/<name>/` unless they start with `lib/` or `.gates/` of the root. Bead: qsm-t1fx and its
children carry the order; this file carries the steps. Task numbers here are not the bead suffixes.

## 1. Measure the engine

Owns: the Measurement table in `design.md`. Bead: qsm-t1fx.1.

- [x] 1.1 Run the probe by hand on the installed version and fill the Measurement table

## 2. Migrate qsm-index and qsm-memory

Owns: `plugins/qsm-index/hooks/`, `plugins/qsm-memory/hooks/`, their `hooks.json`. Blocked by: nothing.
Bead: qsm-t1fx.3.

- [x] 2.1 `session.start`, `session.end`, `tool.call` hooks replace the classic binaries; keep each
  hook's tests, now under `claude plugin test`
- [x] 2.2 Remove the `hooks` entries and the `dist/` hook binaries; update INSTALL.md

## 3. Migrate the Bash guards of qsm-forge, qsm-secrets and qsm-worktrunk

Owns: those three plugins' `hooks/`. Blocked by: nothing. Bead: qsm-t1fx.4.

- [x] 3.1 Tests: "a migrated guard denies what the classic guard denied" for each guard
- [x] 3.2 Answer `{ deny }` from `tool.call`; read the declarations for a function event for
  `WorktreeCreate`, `WorktreeRemove` and `Notification`, and keep those classic with the comment

## 4. Migrate qsm-langdev and qsm-usage

Owns: `plugins/qsm-langdev/hooks/`, `plugins/qsm-usage/hooks/`. Blocked by: nothing. Bead: qsm-t1fx.5.

- [x] 4.1 The langdev guard, edit and gate hooks; `QSM_LANGDEV_ALLOW` still always asks
- [x] 4.2 The usage `bash-filter` and `toon` hooks

## 5. Gate and docs

Owns: `.gates/`, `AGENTS.md`, `openspec/specs/qsm-marketplace/spec.md`. Blocked by: 2, 3, 4.

- [x] 5.1 Test: "a classic hook without a reason fails the gate"; the gate lists every classic hook
- [x] 5.2 Rewrite the AGENTS.md note; apply the Spec sync section of `design.md`; archive the change
