## 1. Prove the instrument first

- [ ] 1.1 A throwaway `Client` in `plugins/qsm-secrets/hooks/review.tsx`, opened by
      `/qsm-secrets review`, that prints each raw key it receives. Proof: in a live session the
      person presses `DEL`, `d`, `y`, the arrows and Escape, and the pane shows `delete`, `d`, `y`,
      `up`/`down`, and Escape returns the focus. No `delete` means stop and ask. Blocks:
      `secrets-recall-detection` applied.

## 2. The index and the verb

- [ ] 2.1 `plugins/qsm-secrets/lib/captures.ts`: read, add and remove rows of
      `<dataDir>/qsm-secrets/captures.json` through `lib/fs.ts`'s atomic write under a lock file.
      Proof: two `qsm-secrets capture` processes started together both leave their row. Blocks: 1.1.
- [ ] 2.2 `capture --session --cwd` writes a row per stored secret; the hook passes both. Proof:
      the installed bin on a real `openvpn --genkey` output writes one row with kind `openvpn-key`
      and no value byte (`grep` for the key body finds nothing in the index). Blocks: 2.1.
- [ ] 2.3 The `captures` verb in `qsm.json` and `scripts/cli.ts`, text and `--json`, dropping rows
      whose entry is gone with a warning; generated noun, `USAGE.md`. Proof: after `secret-tool
      clear` of one entry, `qsm-secrets captures` omits it and warns. Blocks: 2.2.
- [ ] 2.4 `rm` and `prune` remove the row. Proof: `qsm-secrets rm <id> --folder capture`, then
      `captures` no longer lists it. Blocks: 2.3.

## 3. The pane

- [ ] 3.1 The `Client` list: rows from `captures --json` via props, arrows, `d`/`DEL` arm, `y`
      within 3 s posts `delete`, timeout and other keys disarm, the failed-delete row, the empty
      list. The hooks module answers `delete` with `qsm-secrets rm` and reloads the rows. Proof:
      `claude plugin test` mounts the pane on the terminal surface and drives `ui.key` for each
      scenario of the spec against a sandbox vault. Blocks: 2.4.
- [ ] 3.2 The live run: the person opens `/qsm-secrets review` after pasting a certificate, deletes
      it with `DEL` `y`, and `qsm-secrets list --folder capture` agrees. Blocks: 3.1.

## 4. Gates

- [ ] 4.1 validate, lint, typecheck, `bun test ./ ./.gates`, `test:hooks`, `README.md` caveats
      (the index is plain text without values). Blocks: 3.2.
