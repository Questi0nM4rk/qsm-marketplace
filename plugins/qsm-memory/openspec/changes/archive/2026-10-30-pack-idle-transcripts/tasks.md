## 1. The recorded choice

- [x] 1.1 `lib/store.ts`: the `state` (`key`, `value`) and `packed` (`session_id`, `archive`,
  `packed_at`) tables, created on open like the others, with one reader and one writer for
  `state`. Proof: an archive written before the change opens, gains both tables, and the existing
  store tests pass. Blocks: nothing.
- [x] 1.2 `scripts/activate.ts`: `--memory qsm|claude`, `skip` removed; `qsm` records
  `retention=qsm` and `activated_at` unless set, `claude` records `retention=claude` and writes no
  setting. Proof: `scripts/activate.test.ts` runs the Activation scenarios against a sandbox Claude
  home and archive (claude leaves `settings.json` byte-for-byte, a second qsm run keeps
  `activated_at`). Blocks: 1.1.
- [x] 1.3 `lib/retention.ts`: the check reads the recorded choice; under `claude` a deleting value
  is `ok` naming the days and the choice. Proof: `qsm-memory doctor` in a sandbox under no choice,
  `qsm` and `claude`, each with `cleanupPeriodDays: 30`, answers failed, failed, ok. Blocks: 1.1.

## 2. The pack

- [x] 2.1 `lib/pack.ts`, the rule: days of use from `sessions.started_at` plus today, a transcript's
      age, whether a pack is due (choice, grace, cadence). Pure functions over dates and session
      starts. Proof: `lib/pack.test.ts` with the person's cases as data: Monday, a week off, Monday
      (age 5, stays); a 14-day break with 2 sessions (adds 2); the first day back after a 20-day
      break (adds 1); 10 days after activation (grace); 12 days after the last pack (cadence).
      Blocks: 1.1.
- [x] 2.2 `lib/pack.ts`, the move: idle transcripts minus `unsavedTranscripts` minus live sessions
  (`sessions/<pid>.json` with a running pid), `tar` piped to `zstd -19 -T0` into `<name>.part`,
  `zstd -t`, the listing compared, rename, originals removed, `packed` rows, `last_pack_at` claimed
  in one transaction and set back on failure. Proof: the compiled binary on a sandbox Claude home
  holding transcripts copied from `~/.claude/projects` with their mtimes set back: `pack` moves the
  idle ones and their session directories, leaves an unsaved one and a live one, `tar --zstd -tf`
  lists exactly the moved entries, and with `zstd` off `PATH` it fails `missing` and moves nothing.
  Blocks: 2.1.
- [x] 2.3 `qsm.json`: the `pack` verb with `--detach` and `--log`, wired in `scripts/cli.ts` the
  way `save --detach` is; regenerate the noun and `types/index.d.ts`. Proof: `bun run validate`
  (generated gate) and `qsm-memory pack --json` answering the envelope. Blocks: 2.2.

## 3. The doors

- [x] 3.1 `lib/sessions.ts`: `show --full` of a packed session fails `missing` naming the archive
  and its `tar --zstd -xmf` command. Proof: in the 2.2 sandbox, `show <id> --full` after the pack.
  Blocks: 2.2.
- [x] 3.2 `hooks/register.tsx`: `session.start` also runs `$.memory.pack({ detach: true })`.
  Proof: the hooks test drives a session start and `save.log` gains the pack's timestamped line.
  Blocks: 2.3.
- [x] 3.3 README (what you get, caveats: the archive, restore with `tar --zstd -xmf`), USAGE
      (`pack`, the `claude` value), INSTALL (activation values). Proof: `bun run validate` and
      markdownlint. Blocks: 2.3.

## 4. Proof

- [ ] 4.1 The gates: `bun run validate`, `lint`, `typecheck`, `bun test ./ ./.gates`,
  `test:hooks`. Blocks: 1 to 3.
- [ ] 4.2 Test it (task qsm-a0zj.1): the restore end to end on the 2.2 sandbox, `tar --zstd -xmf`
      into the Claude home and `claude --resume <id>` opening the packed session; then, after the
      person's yes, `qsm-setup activate qsm-memory -- --memory qsm` on this machine records the
      choice and `qsm-memory pack` answers `ok` naming the grace. Blocks: 4.1.
