## Intent

Held here until the task tool opens again, then moved to the epic beside `secrets-recall-detection`.
The person, in their words: "make it super easy to remove secrets, maybe even add a mod view, where
i can go thru them with arrows, and than just press DEL, and delete them from the vault".

1. For the person, after the capture took more than was a secret: a certificate, a test value, a
   string that only looked random.
2. `secrets-recall-detection` makes false positives the accepted cost, so removing one must take
   seconds. Today it takes `qsm-secrets list --folder capture`, reading ids with no kind or date,
   and one `qsm-secrets rm` per id; `prune` never removes a capture its own transcript names.
3. Not: showing a value or any part of it, editing a value, restoring the original text into a
   transcript, a review of entries the person stored with `set`.
4. No pane or browser for the vault exists; `rbw` and `secret-tool` list items but know nothing of
   kind, date or session.
5. Proof: the pane opened by `/qsm-secrets review` lists the captures of a real capture run, `d` or
   `DEL` then `y` removes one from the vault, and `qsm-secrets list` agrees.
6. Budget: one verb, one index file, one pane in the existing hooks module; about a day.

## Why

Catching more means more junk in the vault, and the vault keeps no record of what a capture was,
when, or where, so the person cannot tell a junk entry from a real key without reading values.

## What Changes

- An **index of captures** in qsm-secrets' data directory: per stored key its kind, capture time,
  session id and working directory, never a value. `capture` writes a row, `rm` and `prune` remove
  it.
- `capture` takes `--session` and `--cwd`, which the `prompt.submit` hook passes.
- A **new verb `qsm-secrets captures`**: every index row whose entry is still stored, newest first,
  text or `--json`; a row whose entry is gone is dropped and named in a warning.
- A **review pane** in the qsm-secrets hooks module, opened by `/qsm-secrets review`: one row per
  capture (kind, date, project, session), arrows move, `d` or `DEL` asks "y to delete" for 3
  seconds, `y` in that time runs `qsm-secrets rm`, anything else or the timeout returns the row.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qsm-secrets`: "Remove a stored key" and "Prune captured entries no transcript names" also remove
  the index row; new requirements for the index, the `captures` verb and the review pane.

## Impact

- `plugins/qsm-secrets/lib/` (a new `captures.ts` for the index, `capture.ts`, `run-all.ts` or the
  verb module that owns `rm` and `prune`), `scripts/cli.ts`, `qsm.json` (one verb, two flags),
  `hooks/register.tsx` (the command and the pane), a new surface module `hooks/review.tsx`, the
  generated noun, `USAGE.md`, `README.md`.
- Depends on `secrets-recall-detection` for each span's kind.

## Critiques

- **Devil's advocate.** A second store beside the vault drifts: an entry removed with `rbw` or
  `secret-tool` directly leaves an index row. Fixed: `captures` lists only rows whose entry is still
  stored and drops the rest with a warning, so the pane never offers a ghost.
- **Devil's advocate.** Deleting a capture leaves `{{secret:cap_...}}` in the transcript with
  nothing behind it; an agent that uses it later gets `missing`. Accepted: that is exactly what
  deleting junk means, and `missing` names the id.
- **Future archaeologist.** Why a `Client` surface module and not Buttons? A Button's hotkey takes
  only a digit or a lowercase letter, and the person asked for `DEL`; the design says so beside the
  module.
- **Scope sniper.** Undo, multi-select and filters are left out; `d` then `y` per row is two keys,
  and a vault full of junk is a detector problem to fix in `secrets-recall-detection`.
