## Context

`plugins/qsm-secrets` today: `lib/rbw.ts` wraps `rbw`; `lib/entries.ts`, `lib/vault.ts`,
`lib/run.ts`, `lib/blocked.ts`, `lib/doctor.ts`; verbs `set`, `has`, `pipe`, `env`, `list`/`inspect`,
`rm`, `doctor`; a classic PreToolUse Bash guard (`hooks/guard.ts`); `lib/secret-shapes.ts` lives in
`qsm-memory`, not here. The original marketplace used `secret-tool` through a bash `qsm-secret` and
a TypeScript hook that denied `secret-tool lookup` and `search`; a deferred plan
(`docs/plans/qsm-secrets-bitwarden-backend.md`) chose Bitwarden, and the rewrite shipped it with
`rbw`. On this machine `secret-tool` is installed and no Secret Service daemon runs.

The engine declarations give the seams: `prompt.submit` may rewrite the prompt text before it
enters the session (`next({ ...e, text })`); `tool.call` sees a Bash command (`e.command`) and the
subagent's `agentId`, may rewrite it, and may answer `{ deny }`; `process.spawn` takes an `env`;
`session.end` runs at the end.

Claude Code 2.1.285 added `claude plugin configure <plugin> --values-stdin`, which saves a plugin's
options from stdin; the backend choice may use it instead of a file of our own (settled in task 3).

## Goals / Non-Goals

Goals: the agent never reads a stored value; a pasted secret never reaches the model; a person who
chooses libsecret has a tool that is local, with no exception; one conformance test for both
backends.

Non-Goals: protecting against a malicious agent after the vault is unlocked; auto-unlock; a
second store; hiding a secret from the terminal it was typed in.

## Decisions

1. **One interface, two adapters, one test.** `Backend` has `set`, `has`, `deliver`, `names`,
   `remove`. Both adapters pass the same test file; the libsecret one runs against a fake
   `secret-tool` on `PATH`.
2. **The choice is data, not a build.** `setup.json` holds `secrets.backend`;
   `QSM_SECRETS_BACKEND` overrides; an absent choice answers `missing` naming the activation.
3. **libsecret is local, and says so.** The adapter has no network code and no `rbw` import. The
   daemon check is `busctl --user status org.freedesktop.secrets`, falling back to a `dbus-send`
   `NameHasOwner` call when `busctl` is absent; either answers in one process.
4. **Names only.** `names()` returns keys. The libsecret adapter reads `secret-tool search --all`
   attributes and discards the `secret =` lines before they leave the adapter.
5. **A suffix only for a long secret.** The id form is `{{secret:<id>}}`; the visible suffix is the
   last four characters when the secret has 20 or more, none below that.
6. **Capture uses known shapes plus an entropy floor.** Shapes: provider prefixes (`ghp_`, `sk-`,
   `AKIA`, `xox`, JWT and similar); a bare token needs 32 or more characters and Shannon entropy at
   or above 3.5 bits per character. A replaced prompt shows a toast naming the id.
7. **Rendered config is in memory and per session.** `XDG_RUNTIME_DIR/qsm-secrets/<session>/`,
   mode 0700 directory and 0600 files, removed at `session.end`. Another process of the same user
   can read it while the session lives; the spec says so.

## Settled by measurement (Claude Code 2.1.288, 2026-10-03, see the change `hooks-as-function-hooks`)

1. **A hook may rewrite a Bash command and its result.** `echo hello-from-hook` printed the
   hook's replacement; a value the command printed reached the model as the mask, and the transcript
   on disk holds the mask, not the value.
2. **How an id is used (decided).** `tool.call` rewrites `{{secret:<id>}}` in a command into a call
   of the existing verb, `qsm-secrets env <id>=QSM_SECRET_<ID> -- sh -c '<command with
   $QSM_SECRET_<ID>>'`, so the value reaches that one command through its environment and never
   appears in a command text, `ps`, or shell history. Quoting of a single quote in the command is
   the one trap and has its own test.
3. **A result is masked** by the same hook: it compares the result's `stdout` and `stderr` to every
   value stored for an id used in this session and to every captured value, and replaces a match
   with the id.
4. **A prompt rewrite works (spike 6.0).** On 2.1.288, under `cc-plugin-sec-default`, a
   `prompt.submit` hook that returns `next({ ...e, text: replaced })` makes the model see only the
   replacement (verified live).

## Decision: detection scope

Known token shapes plus the entropy floor of decision 6; no free-text guessing. The shapes are one
list in root `lib/secret-shapes.ts`, read by `qsm-memory` (refuse a note) and `qsm-secrets`
(capture). A bare token also needs a digit and must not be plain hex, so an identifier or a commit
hash is not captured.

## Tests became evals

By the person's decision the "conformance test" and the other unit tests of tasks 1 to 8 became
evals: a live run of the compiled binary or of the hook in a real session. The scenario titles stay
as the names of what each eval shows.

## Session-end scrub (added late)

The engine writes a queued prompt raw into the transcript as a `queue-operation` line before the
hooks run, so the prompt rewrite does not reach that line. `qsm-secrets scrub` rewrites the
transcript atomically at `session.end`, detached because the chain is cut at 1.5 s.

## Possible improvements

- A secret that a command prints through a tool the hook does not see (an MCP result, a file the
  agent then reads) is not masked; masking `Read` results of the rendered directory is a later task.
- `claude plugin configure <plugin> --values-stdin` (2.1.285) may hold the backend choice.
- A toast on capture could offer a one-key undo (remove the stored id) for a false positive.

## Risks / Trade-offs

- [False positive on a prompt] → toast, removal verb, entropy floor.
- [libsecret listing leaks a value] → the adapter drops `secret =` lines; a test with a
  value-shaped secret proves it.
- [A subagent loses the hook's state] → measured: the module state is shared on 2.1.288; the
  measurement is repeated by hand on a new release, no test holds it.
- [Two backends cost two code paths] → one interface, one test, no shared state between adapters.

## Spec sync

The durable spec `plugins/qsm-secrets/openspec/specs/qsm-secrets/spec.md` gets the ADDED
requirements appended after "Select which stored namespace a call reads or writes"; "Browse stored
keys without exposing any value" and "Direct value-reading commands are blocked from agent tool
calls" are replaced whole by the MODIFIED forms of this change when it lands. Archive with
`openspec archive secrets-backends-and-session-guard --skip-specs` after the sync.
The scrub requirement is added to the durable spec by hand.
