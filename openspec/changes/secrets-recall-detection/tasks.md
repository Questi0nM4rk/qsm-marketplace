## 1. Corpus first, from real producers

- [x] 1.1 Key-material cases made at test time in a `sandboxDir` by the real producers:
      `openvpn --genkey secret <file>`, `ssh-keygen` (ed25519, rsa, ecdsa; one with `-N`),
      `openssl req -x509` (certificate) and `openssl req -new` (CSR), `gpg` with a throwaway
      `GNUPGHOME` (`--armor --export-secret-keys` and `--export`), a cut-short private key, an
      `.ovpn` with `<ca>` `<key>` `<tls-auth>`. In the seeded generator of
      `plugins/qsm-secrets/lib/capture.corpus.ts`: a `ghp_` token with a wrong CRC32, Czech prompts
      (`heslo je ...`, `HESLO=...`), templates (`<your-password>`, `${GITHUB_TOKEN}`, `changeme`).
      No literal key or token is committed. PuTTY waits for `puttygen`, which is absent. Proof:
      `bun test plugins/qsm-secrets/lib/capture.test.ts` fails on the new positives today (recall
      below 1.0), which shows the corpus reaches the gaps. Blocks: nothing.

## 2. Claimed ranges and the block pass

- [x] 2.1 The span type of the shapes file (root `lib/`) gains a kind, and each pattern names its
      kind. qsm-memory compiles and its tests pass. Proof: typecheck and
      `bun test plugins/qsm-memory`. Blocks: 1.1.
- [x] 2.2 `plugins/qsm-secrets/lib/detect.ts`: one claimed-range list shared by the passes in the
      spec's order; the block pass for any label, the unfinished block, and the kind table. Proof:
      the corpus lines for blocks (OpenVPN, certificate, CSR, PGP, cut-short key, `.ovpn`) each give
      the expected spans and kinds. Blocks: 2.1.

## 3. Shapes, credential values, bare tokens

- [x] 3.1 Shapes from gitleaks' prefix rules for the providers named in the spec, converted to JS,
      the MIT notice in a header comment beside the data; no checksum filter. Proof: each shape's
      corpus positive and negative. Blocks: 2.2.
- [x] 3.2 Credential words with Czech, the 6-character floor for every credential name, the
      stopword set of the spec. Proof: the Czech and template corpus lines. Blocks: 2.2.
- [x] 3.3 Bare-token floor 0.8 and the hex rule (commit and UUID pass, other hex of 32+ is
      captured). Proof: the full corpus at recall 1.0 and precision of at least 0.85, and the
      existing UUID and commit scenarios still pass. Blocks: 3.1, 3.2.

## 4. The real path

- [x] 4.1 The toast names the kind. Proof: the installed `qsm-secrets capture` on each producer's
      real output (piped, in a scratch vault namespace) prints one placeholder per block, and a
      prompt of a few KB is captured in under 5 ms of detection time, measured. Blocks: 3.3.
- [x] 4.2 Gates: validate, lint, typecheck, `bun test ./ ./.gates`, `test:hooks`. Blocks: 4.1.
