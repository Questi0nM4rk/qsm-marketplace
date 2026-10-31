## 1. Prove the instrument first

- [ ] 1.1 A throwaway `Client` in `plugins/qsm-secrets/hooks/review.tsx`, opened by
      `/qsm-secrets review`, that prints each raw key it receives. Proof: in a live session the
      person presses `DEL`, `d`, `y`, the arrows and Escape, and the pane shows `delete`, `d`, `y`,
      `up`/`down`, and Escape returns the focus. No `delete` means stop and ask. Blocks:
      `secrets-recall-detection` applied.
      Built as the real list rather than a throwaway (review.tsx). The engine half is proved:
      `claude plugin test` hands the Client `delete`, `d`, `y`, `up` and `down` through `ui.key` on
      the terminal and desktop surfaces and each does its job (hooks/review.test.ts). Escape never
      reaches a Client by the engine's contract, so only the live run shows it returns the focus.
      Open: the live key presses, steps at the end of this file.

## 2. The index and the verb

- [x] 2.1 `plugins/qsm-secrets/lib/captures.ts`: read, add and remove rows of
      `<dataDir>/qsm-secrets/captures.json` through `lib/fs.ts`'s atomic write under a lock file.
      Proof: two `qsm-secrets capture` processes started together both leave their row. Blocks: 1.1.
      Done: the compiled bin, the real libsecret vault, a sandbox data dir: three rounds of two
      captures started together left 3, 5, 7 rows; ten at once left 10. The flock primitive is
      root `lib/fs.ts`'s `tryFlock`, shared with qsm-ccr's lock.
- [x] 2.2 `capture --session --cwd` writes a row per stored secret; the hook passes both. Proof:
      the installed bin on a real `openvpn --genkey` output writes one row with kind `openvpn-key`
      and no value byte (`grep` for the key body finds nothing in the index). Blocks: 2.1.
      Done: a real `openvpn --genkey secret` key wrote one row, kind `openvpn-key`, session and cwd
      as passed; none of its 16 body lines and not its last four characters are in the index. The
      hook passes `--session` and `--cwd` (hooks/register.test.ts asserts the argv).
- [x] 2.3 The `captures` verb in `qsm.json` and `scripts/cli.ts`, text and `--json`, dropping rows
      whose entry is gone with a warning; generated noun, `USAGE.md`. Proof: after `secret-tool
      clear` of one entry, `qsm-secrets captures` omits it and warns. Blocks: 2.2.
      Done: after the backend's own clear of the openvpn entry, `captures --json` listed the other
      six and warned that its row was removed; the index no longer held it.
- [x] 2.4 `rm` and `prune` remove the row. Proof: `qsm-secrets rm <id> --folder capture`, then
      `captures` no longer lists it. Blocks: 2.3.
      Done: `rm <id> --folder capture` answered ok, and neither `captures` nor the index held it;
      every entry the runs stored was removed, and `qsm-secrets list` before and after was the same.

## 3. The pane

- [x] 3.1 The `Client` list: rows from `captures --json` via props, arrows, `d`/`DEL` arm, `y`
      within 3 s posts `delete`, timeout and other keys disarm, the failed-delete row, the empty
      list. The hooks module answers `delete` with `qsm-secrets rm` and reloads the rows. Proof:
      `claude plugin test` mounts the pane on the terminal surface and drives `ui.key` for each
      scenario of the spec against a sandbox vault. Blocks: 2.4. Done: hooks/review.test.ts, 8 tests
      on terminal and desktop: the command, the row label, down DEL y deletes through
      `qsm-secrets rm`, the arm still set at 2.9 s and gone at 3 s, d then down disarms, a failed rm
      keeps the row with `failed: missing` and toasts, a post of an unlisted id deletes nothing, the
      empty list. The kit runs without processes, so a `process.run` hook stands in for the bin; the
      bin's `captures` and `rm` ran on the real vault in 2.1 to 2.4.
- [ ] 3.2 The live run: the person opens `/qsm-secrets review` after pasting a certificate, deletes
      it with `DEL` `y`, and `qsm-secrets list --folder capture` agrees. Blocks: 3.1.

## 4. Gates

- [x] 4.1 validate, lint, typecheck, `bun test ./ ./.gates`, `test:hooks`, `README.md` caveats
      (the index is plain text without values). Blocks: 3.2.
      Done on this tree before 3.2: all green but the known flaky qsm-ccr port test; run them again
      if 3.2 changes code.

## Steps for the owner (1.1 live, 3.2)

1. After the merge, open a fresh interactive `claude` session (a running session keeps the module
   it loaded).
2. Make a junk capture: print a throwaway certificate with
   `openssl req -x509 -newkey ed25519 -nodes -subj /CN=junk -keyout /dev/null -days 1 2>/dev/null`
   and paste it into the prompt. The toast names its id, kind `pem-block`.
3. Run `/qsm-secrets review`. The pane opens with the list; the newest row has `>` before it.
4. 1.1: press the down and up arrows: the `>` moves. If the arrows scroll the pane instead, click
   the list once and try again, and note it here. Press DEL: the row ends in `y to delete`. Wait 3
   seconds: it goes. Press `d`, then the down arrow: no `y to delete`, the `>` moved. Press Escape:
   the keyboard is back in the prompt. If DEL shows nothing, stop: the choice is `d` alone, or
   waiting for the engine.
5. 3.2: open the pane again, move to the `pem-block` row, press DEL then `y`. The row leaves. In a
   shell, `qsm-secrets list --folder capture` no longer names the id from step 2, and
   `qsm-secrets captures` does not list it.
