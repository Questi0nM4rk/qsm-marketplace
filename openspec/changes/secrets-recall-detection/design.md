## Context

`secretSpans` in `plugins/qsm-secrets/lib/detect.ts` runs three passes over a prompt: known shapes
from root `lib/secret-shapes.ts` (one of them a PEM private-key regex), a value after a credential
name, and a bare token of 32 or more characters scored by Miller-Madow normalised entropy. Each pass
filters hard so that precision stays 1.0 on `lib/capture.corpus.ts`. The research of 2026-10-30
(gitleaks, detect-secrets, trufflehog, Nosey Parker, Kingfisher, secretlint, GitHub, GitGuardian)
found the same five methods everywhere: prefix shapes, checksums, keyword proximity, entropy, and
PEM labels, with stopwords as the false-positive control.

## Goals / Non-Goals

**Goals:** recall 1.0 on the corpus; one span per block; a kind on every span; the same in-process
call and cost.

**Non-Goals:** live verification, a model, decoding encoded secrets, a keyword prefilter (a prompt
is a few KB), an outside binary.

## Decisions

1. **The rule: a miss is permanent, a false positive is two keys.** Every filter is judged by it.
   A filter stays only when what it removes is plainly not a value (a template, `true`, a repeated
   character, an alphabet run); a filter that removes something that might be a value goes.
2. **Order of passes, and what each one claims.** Placeholders first, as today. Then the block
   pass. Then shapes, then credential values, then bare tokens. A later pass skips any text an
   earlier one claimed, so a block's lines never come out as 17 tokens and a shape is never cut
   again by the bare-token filters. This replaces the current overlap merge with a claimed-range
   list, the one mechanism every pass shares.
3. **The block pass takes every label.** `-----BEGIN (label)-----` to the matching
   `-----END (label)-----`, or to the end of the text when the end is missing (a paste cut short).
   The label sets the kind: `private-key` when it ends in `PRIVATE KEY` or `PRIVATE KEY BLOCK`,
   `openvpn-key` for `OpenVPN Static key V1`, `pem-block` for any other. No table of public labels:
   under the rule, a certificate costs one vault entry, which is cheaper than keeping a list right.
   A PuTTY key header (`PuTTY-User-Key-File-` and its version digit) starts a block that ends at
   `Private-MAC:` and its line.
4. **Shapes from gitleaks' rule data**, MIT, copyright 2019 Zachary Rice, notice kept in a header
   comment beside the data in `lib/secret-shapes.ts`. Only rules with a fixed prefix, converted
   from Go RE2 to JS by hand and each with one positive and one negative example from the
   provider's documentation. `generic-api-key` is not taken: the credential-value pass does that
   job. The GitHub CRC32 is not checked: a shape that matches is captured.
5. **Credential words** gain Czech (`heslo`, `klic`, `klíč`, `tajne`, `tajné`, `token` already
   counts) and a value after any credential word counts from 6 characters, no longer 16 for the
   non-password words, because a short token is still a token.
6. **The bare-token pass** keeps the Miller-Madow floor but at 0.8 instead of 0.9, and keeps its
   32-character minimum; the hash, id, path and URL filters stay, since those are values this
   machine shows every turn and they are not credentials. The hex-only rule (`HEX_AND_HYPHENS`)
   becomes: hex of 40 characters (a commit) or a UUID passes, and any other hex run of 32 or more
   is judged like any token, at the same 0.8 floor measured against the 16-letter hex alphabet, so
   a random hex key is captured and `0000...` or `aaaa...1` is not. A token no longer needs both a
   letter and a digit, since a random token of one class is still random.
7. **A span carries `kind`**, a string the review pane prints. `Span` in `lib/secret-shapes.ts`
   gains it, so qsm-memory reads it too and ignores it.
8. **Key material comes from real producers, run at test time**: an OpenVPN key from
   `openvpn --genkey secret`, keys from `ssh-keygen` (ed25519, rsa, ecdsa, one with a passphrase),
   a certificate and a CSR from `openssl req`, a PGP key from `gpg` in a throwaway home, all in a
   sandbox directory the test removes. Pasting their output into the corpus is ruled out by the
   corpus file's own rule (no literal token in the repository for a scanner to flag), which the
   repository's gitleaks and detect-secrets gates enforce. Tokens and Czech prompts stay in the
   seeded generator. A missing producer fails the test loud; PuTTY waits for `puttygen`.

## Risks / Trade-offs

- **More vault entries.** Expected and accepted; the review pane is the answer, and its change
  depends on this one for `kind`.
- **qsm-memory sees new shapes.** Its "looks secret" check flags more text; its spec says it warns,
  so a broader warning is safe. Checked by its tests in the gates.
- **Hand-converted regexes drift from gitleaks.** Accepted: the data is a copy with a notice, and a
  miss on a new provider is fixed by adding its shape and corpus line.

## Migration

None. The vault holds no captured entries today, and a span's new field is additive to its one
reader.
