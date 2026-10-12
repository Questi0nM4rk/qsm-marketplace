Every slice was proved by the person's decision with evals (a live run of the real thing) rather
than new unit tests; the scenario titles name what each eval shows. Every slice ends with `bun run
validate`, `bun run lint`, `bun run typecheck` and `bun test` green, and updates README.md and
USAGE.md for the verbs it touches. Paths are under `plugins/qsm-secrets/` unless they start with
`lib/` of the root. The beads qsm-tpu3 and its children carry the order; this file carries the
steps. Tasks 5 to 7 needed a function-hook guard: the measurement that allowed it is in
`design.md`.

## 1. One backend interface, the rbw adapter, one conformance test

Owns: `lib/backend.ts` (new), `lib/rbw.ts`, `lib/vault.ts`, `lib/entries.ts`, `lib/backend.test.ts`
(new). Blocked by: nothing. Bead: qsm-tpu3.1.

- [x] 1.1 Test: "both backends pass the same conformance test" against the rbw adapter first
- [x] 1.2 Move the rbw calls behind `Backend`; no behaviour change, existing tests stay green

## 2. libsecret backend, strictly local, with a daemon check

Owns: `lib/libsecret.ts` (new), `lib/libsecret.test.ts`, a fake `secret-tool` fixture. Blocked by: 1.
Bead: qsm-tpu3.2.

- [x] 2.1 Tests: "libsecret never touches the network", "no secret service answers missing"
- [x] 2.2 The adapter and the one-process bus check (`busctl --user status`, `dbus-send` fallback)
- [x] 2.3 The conformance test runs against it

## 3. The backend is chosen at activation

Owns: the activation script of the plugin, `qsm.json`, the `setup.json` key. Blocked by: 1 and
`qsm-1rj2.1` (the `ask()`). Bead: qsm-tpu3.3.

- [x] 3.1 Tests: "activation without a choice asks and writes nothing", "the chosen backend is the
  only one used"
- [x] 3.2 `--backend`, the ask, the write, `QSM_SECRETS_BACKEND`, the `missing` answer for no choice

## 4. Listing prints names only

Owns: `lib/entries.ts`, `lib/libsecret.ts`. Blocked by: 1. Bead: qsm-tpu3.4.

- [x] 4.1 Test: "list never prints a value" with a value-shaped secret on both backends
- [x] 4.2 The libsecret adapter reads attributes and drops `secret =` lines

## 5. The guard is a function hook

Owns: `hooks/register.tsx`, `hooks/guard.ts` (deleted), `hooks/hooks.json`. Blocked by: nothing
but the shared hook test of qsm-t1fx.1. Bead: qsm-tpu3.5.

- [x] 5.1 Tests: "a raw reader is denied with the wrapper to use", "a store is allowed"
- [x] 5.2 `tool.call` on Bash answers `{ deny }`; remove the classic binary

## 6. A pasted secret is captured before the prompt enters the session

Owns: `hooks/register.tsx`, `lib/capture.ts` (new), `lib/capture.test.ts`. Blocked by: 1. Bead: qsm-tpu3.6.

- [x] 6.0 Spike: a throwaway mod replaces a marker typed in a message (`prompt.submit`,
  `next({ ...e, text })`); record the result in `design.md` before any capture code
- [x] 6.1 Tests: "a pasted token is replaced by its id before the prompt enters the session", "a
  short secret shows no suffix", "a prompt with no secret is not changed"
- [x] 6.2 Shapes plus the entropy floor; store under a generated id; the toast
- [x] 6.3 Test: "the transcript holds the id and not the value" through `qsm-memory save`

## 7. An id is replaced at use and a stored value is masked in a result

Owns: `hooks/register.tsx`, `lib/substitute.ts` (new). Blocked by: 6. Bead: qsm-tpu3.7.

- [x] 7.1 Spike: what `tool.call` may rewrite; done, both the command and the result (`design.md`)
- [x] 7.2 Tests: "an id in a command is replaced for that command only", "a value in a tool result
  is masked"
- [x] 7.3 The rewrite into `qsm-secrets env ... -- sh -c`, with a test for a single quote in the
  command, and the mask

## 8. Config files rendered per session in memory and removed at its end

Owns: `lib/render.ts` (new), `scripts/cli.ts`, `qsm.json`, `hooks/register.tsx` (the `session.end`
cleanup). Blocked by: 1. Bead: qsm-tpu3.8.

- [x] 8.1 Tests: "a rendered file lives only in the session directory", "the session end removes it"
- [x] 8.2 `render` and the cleanup; state the limit in README.md

## 8b. A session end scrubs captured values still in the transcript

Owns: `lib/run.ts`, `scripts/cli.ts`, `qsm.json`, `hooks/register.tsx` (the `session.end` call).
Added late: the engine writes a queued prompt raw into the transcript as a `queue-operation` line
before any hook runs, so capture alone leaves the value on disk.

- [x] 8b.1 `scrub <transcript|session>` rewrites the file atomically, with `--detach` for the
  1.5 s session-end limit
- [x] 8b.2 The `session.end` hook runs `clean`, then `scrub` detached

## 9. Docs, skill and sync

Owns: `README.md`, `INSTALL.md`, `USAGE.md`, `skills/qsm-secrets/SKILL.md`,
`openspec/specs/qsm-secrets/spec.md`. Blocked by: 1 to 8.

- [x] 9.1 The skill names the placeholder only if task 7 shipped it
- [x] 9.2 Apply the Spec sync section of `design.md`; `openspec validate --strict`; archive
