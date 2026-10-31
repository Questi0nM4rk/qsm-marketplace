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
   under an exclusive lock file beside it, held only for the write, so neither row is lost.
2. **The index never holds a value or any part of one**, not the last four characters either: the
   file is plain text in the home directory, unlike the vault.
3. **`captures` is the one reader.** It joins the index with the backend's list, prints rows whose
   entry is stored, newest first, and removes rows whose entry is gone, naming each in a warning:
   a half-state that still works. The pane and a person at a shell read the same verb (one logic,
   two doors).
4. **`rm` and `prune` own the removal of a row**, after the backend removed the entry; a row whose
   removal fails after the entry went is the drift `captures` repairs on its next run.
5. **The pane is a `Client`** in `hooks/review.tsx`, because the person asked for `DEL` and only a
   `Client` gets raw keys. The hooks module registers the command `qsm-secrets` (args `review`),
   opens the pane with focus, loads `captures --json` into the `Client`'s props, and answers its
   `ui.message` posts: `delete <namespace>/<key>` runs `qsm-secrets rm`, then reloads. The 3-second
   arm lives in the `Client`'s own timer, so a reload of the hooks module cannot leave a row armed.
6. **A row shows kind, local date and time, the working directory's last segment, and the session's
   first eight characters**, e.g. `private-key  31 Oct 14:02  qsm-marketplace  42ffbd7c`. Escape
   returns focus to the prompt; the pane stays until closed.
7. **A failed delete keeps the row** and shows the outcome code beside it (`missing`, `failed`),
   and the toast names the id and the code; nothing is retried.

## Risks / Trade-offs

- **The `Client` API is larger than Buttons.** Its first task proves the raw `delete` key reaches
  the module on this build before anything else is built; if it does not, the work stops and the
  person decides between `d` alone and waiting.
- **Unverified:** whether pane content reaches the model's context. Nothing in the pane is a value,
  so the answer does not change what is safe.

## Migration

None: the vault holds no captured entries today, so the index starts empty and complete.
