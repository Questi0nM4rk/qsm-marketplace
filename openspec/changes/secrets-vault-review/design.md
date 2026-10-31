## Context

Both backends (rbw, libsecret) store three fields beside a value: name, folder, and the wrapper's
mark; the libsecret reader parses `secret-tool` stderr on the assumption that every item carries
exactly those three attributes. The hooks module `plugins/qsm-secrets/hooks/register.tsx` already
runs `qsm-secrets capture` on `prompt.submit` and has `$.process.run` and `$.ui` at hand. Claude
Code's mod API draws a pane with `$.ui.open` and a `ui.render` hook; a `Client` element runs its own
surface module with local state and timers and receives raw keys, `delete` included; a Button's
hotkey takes only a digit or a lowercase letter.

## Goals / Non-Goals

**Goals:** a person removes a junk capture in three keys without seeing its value; the record of
what a capture was outlives the session.

**Non-Goals:** undo, a value preview, reviewing `set` entries, the desktop or mobile surface beyond
what the terminal tree gives for free.

## Decisions

1. **The index is a sidecar file**, `<dataDir>/qsm-secrets/captures.json`, the path from
   `lib/paths.ts`: `{ "<namespace>/<key>": { kind, capturedAt, session, cwd } }`. Chosen over vault
   attributes by the person, because it leaves both backends and the libsecret parser alone. It is
   written with `lib/fs.ts`'s tmp-and-rename write; two captures at once are read-modify-write
   under an exclusive lock file beside it, held only for the write, so neither row is lost. The
   index is written after the backend acts: a capture whose index write fails has stored its
   values, so its error names the file and `qsm-secrets doctor`, whose index check reads the rows
   and tries the lock (a flock, never stale: a held lock is a running qsm-secrets).
2. **The index never holds a value or any part of one**, not the last four characters either: the
   file is plain text in the home directory, unlike the vault.
3. **`captures` is the one reader.** It joins the index with the backend's list, prints rows whose
   entry is stored, newest first, and removes rows whose entry is gone, naming each in a warning:
   a half-state that still works. A listing that fails is never read as empty: the libsecret search
   exits 0 when nothing matches and 1 when the Secret Service could not answer (measured with an
   unreachable bus; a cancelled unlock prompt is expected to fail the same way, unverified), so a
   non-zero exit fails the verb before any row is forgotten, as rbw's failed `list` already does.
   The pane and a person at a shell read the same verb (one logic, two doors).
4. **The index follows the backend operation, not the verb.** One step in `lib/run.ts` removes an
   entry from the backend and then its row, or moves the row when the entry was copied to a new
   name first; `rm`, `prune` and `rename` all go through it, so a renamed capture keeps its kind,
   time, session and cwd under the new id. `set`, in a terminal or `--gui`, drops the row of the
   key it writes. A row update that fails after the backend acted is a warning naming the index,
   never the verb's failure, because the vault change stands; `captures` repairs a row whose entry
   is gone.
5. **The pane is a `Client`** in `hooks/review.tsx`, because the person asked for `DEL` and only a
   `Client` gets raw keys. The hooks module registers the command `qsm-secrets` (args `review`),
   lists `captures --json` when the command runs into the session's state (`$.state`), opens the
   pane with focus, and draws the `Client` from that cache, so a render spawns nothing (a pane drawn
   before the command ever ran lists the rows itself, because a render may not write state). It
   answers the `ui.message` post `{ delete: <namespace>/<key> }` only for an id the cache lists,
   runs `qsm-secrets rm`, and drops the row from the cache and the props it answers, one spawn per
   delete; with no cache yet it lists first, as the render did. The cache is changed through
   `update` applied to its current value, so two replies cannot undo each other. The 3-second arm
   lives in the `Client`: a one-shot timer started with the arm, so a reload of the hooks module
   cannot leave a row armed. The selection and the arm hold a row's id and its place: a reply that
   drops a row moves the rows under it, and a row that moved is disarmed, so `y` never confirms a
   row the person did not arm.
6. **A row shows kind, local date and time, the working directory's last segment, and the session's
   first eight characters**, e.g. `private-key  31 Oct, 14:02  qsm-marketplace  42ffbd7c`
   (`toLocaleString("en-GB")`), and the id when it is a name (`qsm/deploy-key`), so a key the
   person named reads differently from `cap_` junk. Escape returns focus to the prompt; the pane
   stays until closed.
7. **A failed delete keeps the row** and shows the outcome code beside it (`missing`, `failed`; an
   `rm` that timed out or printed no envelope is `failed`, its cause in the log),
   kept in the cache beside the rows so a redraw shows it too, and the toast names the id and the
   code; nothing is retried.

## Risks / Trade-offs

- **The `Client` API is larger than Buttons.** Its first task proves the raw `delete` key reaches
  the module on this build before anything else is built; if it does not, the work stops and the
  person decides between `d` alone and waiting.
- **Unverified:** whether pane content reaches the model's context. Nothing in the pane is a value,
  so the answer does not change what is safe.

## Migration

None: the vault holds no captured entries today, so the index starts empty and complete.
