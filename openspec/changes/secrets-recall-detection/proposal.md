## Intent

Held here until the task tool opens again, then moved to the epic. The person, in their words:
"we should scan more, and than remove, than scan less, and let agents work with secrets."

1. For the person who pastes keys, tokens and configs into a prompt, and for the agent that then
   works with them through `{{secret:<id>}}` without ever seeing a value.
2. A miss writes the value into the transcript for good; a false positive costs one vault entry the
   person deletes in the review pane (`secrets-vault-review`). Today the capture is tuned the other
   way: precision 1.0 is a test gate, an OpenVPN static key passes uncaught, and a public
   certificate becomes 17 vault entries.
3. Not: live verification, a model, decoding, an outside scanner at run time, scanning files the
   agent reads (the mask covers those once a value is stored).
4. gitleaks and detect-secrets exist and are installed, but both miss the OpenVPN key and gitleaks
   misses a short `password=`; we take their rule data and methods, not their binaries.
5. Proof: the labelled corpus, grown with fixtures from real producers, at recall 1.0; the five
   probe cases of 2026-10-30 each give exactly one span.
6. Budget: one change to `lib/detect.ts` and `lib/secret-shapes.ts`, a corpus extension, about a
   day of work; the capture stays in process and under 5 ms for a prompt of a few KB.

## Why

The capture decides with precision first, so a secret it is unsure of stays in the prompt and lands
in the transcript, where it cannot be taken back; a false positive, by contrast, only adds a vault
entry the agent can still use. Measured on 2026-10-30: an OpenVPN static key gives 0 spans, a PEM
certificate gives 17 one-line spans, and `heslo je <value>` gives 0.

## What Changes

- **BREAKING (contract):** the capture's corpus gate becomes recall 1.0 with a precision floor of
  0.85, replacing precision 1.0 with recall 0.95. A borderline value is captured, not let through.
- A block pass reads every `-----BEGIN <label>-----` ... `-----END <label>-----` block, any label,
  as one secret: private keys, OpenVPN static keys, certificates, PGP blocks, and labels nobody
  listed. Its lines are never judged one by one again.
- Token shapes grow from gitleaks' rule data (MIT, notice kept) and detect-secrets' private-key
  markers (Apache-2.0), including the PuTTY key header; a GitHub token's CRC32 is not a filter,
  a matching shape is captured whatever its checksum.
- Credential words grow, Czech included (`heslo`, `klic`, `klíč`, `tajne`, `tajné`), and a value
  after them counts from 6 characters.
- Stopwords only remove what is plainly not a value: `true`, `false`, `null`, a template
  (`<x>`, `${x}`, `{x}`, `{{x}}`), one character repeated, an alphabet or digit run, and
  `changeme`, `example`, `your-...`.
- Each span carries its kind (`private-key`, `pem-block`, `github-pat`, `credential-value`,
  `random-token`, ...) so the review pane can name it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qsm-secrets`: "A pasted secret is captured before the prompt enters the session" changes its
  detection rule, its corpus gate, and gains the block pass and the span kind.

## Impact

- `plugins/qsm-secrets/lib/detect.ts`, `lib/secret-shapes.ts` (root `lib/`, read by qsm-memory too),
  `plugins/qsm-secrets/lib/capture.corpus.ts`, `lib/capture.test.ts`.
- qsm-memory's "this looks secret" check reads `lib/secret-shapes.ts`, so it sees the new shapes as
  well; its own spec keeps its behaviour.
- The hook's toast names each id with its kind (`hooks/register.tsx`); no change to the CLI verbs
  or the backends. Shape kinds take gitleaks' rule ids (`github-pat`), which qsm-memory's notes test
  reads.

## Critiques

- **Devil's advocate.** Capturing every PEM block means a pasted certificate chain or a PGP
  signature becomes a vault entry and the agent sees a placeholder where it expected a public
  certificate. Kept, by the person's rule: the agent can still use the placeholder in a command,
  and the review pane removes it in two keys. The SSH public-key line (`ssh-ed25519 AAAA...`)
  stays uncaptured, as today, because it is not a block and is pasted to be copied elsewhere.
- **Devil's advocate.** A precision floor of 0.85 is a number nobody measured against real
  prompts. Fixed as a floor, not a goal: it only stops a change that floods the vault; the corpus
  says where precision lands, and the number is the person's to move.
- **Future archaeologist.** Why does the capture take a value gitleaks would reject? The design
  section names the rule (a miss is permanent, a false positive is two keys) and the person's
  words above, so the next reader does not "fix" recall back to precision.
- **Scope sniper.** Copying all ~200 gitleaks rules is more than a person's prompts need. Cut to
  the prefix rules for services this machine uses and the high-precision provider shapes; the
  rest are added when a miss shows one is needed.
