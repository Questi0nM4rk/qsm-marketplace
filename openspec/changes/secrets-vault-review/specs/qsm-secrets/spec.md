## ADDED Requirements

### Requirement: Every capture is recorded in an index that holds no value

`qsm-secrets capture` SHALL, for each secret it stores, write one row to the index file
`<dataDir>/qsm-secrets/captures.json` keyed by `<namespace>/<key>`, holding the secret's kind, the
capture time, the session id and the working directory it was given with `--session` and `--cwd`.
The index SHALL never hold a value or any part of one. A `rename` of a captured entry SHALL file its
row under the new name with its kind, time, session and working directory kept. Two captures that
run at once SHALL both keep their rows. The `prompt.submit` hook SHALL pass the session id and the
working directory.

#### Scenario: a capture writes its row

- **WHEN** a prompt with one private key is captured in session `s1` under `/home/u/proj`
- **THEN** the index holds one row for the new id with kind `private-key`, a capture time, session
  `s1` and cwd `/home/u/proj`, and no byte of the key

#### Scenario: a renamed capture keeps its row

- **WHEN** a captured entry is renamed with `qsm-secrets rename`
- **THEN** `qsm-secrets captures` lists it under the new name with its kind, time, session and cwd,
  and no longer under the old one

#### Scenario: two captures at once keep both rows

- **WHEN** two sessions capture a secret each at the same moment
- **THEN** the index holds both rows

### Requirement: The captures verb lists what the capture stored, never a value

`qsm-secrets captures` SHALL print every index row whose entry the backend still stores, newest
first, as text or under `--json` as
`{ rows: [{ namespace, key, kind, capturedAt, session, cwd }] }`, and SHALL never print a value. A
row whose entry is no longer stored SHALL be removed from the index and named in a warning. An empty
index SHALL print that nothing was captured, as success.

#### Scenario: listing captures

- **WHEN** the index holds rows for two stored entries
- **THEN** both are listed, newest first, with kind, time, session and cwd, and no value

#### Scenario: an entry removed outside the wrapper

- **WHEN** an index row names an entry that was removed with the backend's own tool
- **THEN** the row is not listed, it is removed from the index, and a warning names it

### Requirement: The review pane removes a capture in three keys

The command `/qsm-secrets review` SHALL open a pane with the keyboard focus in a list of the
`captures` rows, each showing the kind, the local date and time, the last segment of the working
directory and the first eight characters of the session id, and never a value. The arrow keys SHALL
move between rows. `d` or `DEL` on a row SHALL arm it, showing `y to delete`; `y` within 3 seconds
SHALL run `qsm-secrets rm` for that entry and drop the row from the list; any other key or 3 seconds
without one SHALL disarm the row. A failed removal SHALL keep the row with its outcome code beside
it and a toast naming the id and the code. Escape SHALL return the focus to the prompt. An empty
list SHALL say that nothing was captured.

#### Scenario: deleting a junk capture

- **WHEN** the person opens the pane, moves to a `pem-block` row, presses `DEL` and then `y`
- **THEN** the entry is no longer stored, its index row is gone, and the row leaves the list

#### Scenario: the arm expires

- **WHEN** the person presses `d` on a row and nothing for 3 seconds
- **THEN** the row shows as before and `y` afterwards removes nothing

#### Scenario: another key disarms

- **WHEN** the person presses `d` on a row and then the down arrow
- **THEN** the row is disarmed, nothing is removed, and the focus moves down

#### Scenario: a failed delete stays visible

- **WHEN** `qsm-secrets rm` fails for an armed and confirmed row
- **THEN** the row stays with the outcome code beside it, and a toast names the id and the code

## MODIFIED Requirements

### Requirement: Remove a stored key

The wrapper SHALL delete a named stored key on request, SHALL remove its row from the capture
index when it has one, and SHALL report failure, not a silent success, when the key was not stored.

#### Scenario: Removing a stored key

- **WHEN** the caller removes a key that is stored
- **THEN** the key is no longer stored and no longer found by any other verb

#### Scenario: Removing a key that was never stored

- **WHEN** the caller removes a key that does not exist
- **THEN** the wrapper reports failure

#### Scenario: Removing a captured key removes its index row

- **WHEN** the caller removes a key the capture stored
- **THEN** `qsm-secrets captures` no longer lists it

### Requirement: Prune captured entries no transcript names

The wrapper SHALL remove every entry of the capture namespace whose id appears in no session
transcript under `~/.claude/projects`, and its capture index row, print each removed id and never a
value, and with `--dry-run` only list them. It SHALL refuse, as missing, when there is no transcript
to check against, because every id would then look unused.

#### Scenario: An unnamed capture is pruned

- **WHEN** a captured entry's id appears in no transcript and the caller runs prune
- **THEN** the entry and its index row are removed, its id is printed, entries of other namespaces
  and ids a transcript names are kept, and a second run removes nothing

#### Scenario: A dry run changes nothing

- **WHEN** the caller runs prune with `--dry-run`
- **THEN** the ids that would be removed are listed and every entry is still stored

#### Scenario: No transcript to check against

- **WHEN** no transcript exists under `~/.claude/projects`
- **THEN** the wrapper reports missing and removes nothing
