## MODIFIED Requirements

### Requirement: A pasted secret is captured before the prompt enters the session

A function hook on `prompt.submit` SHALL find the secrets in the prompt text, SHALL store each in
the chosen backend under a generated id, and SHALL pass down a prompt in which the value is replaced
by `{{secret:<id>}}` followed, for a secret of 20 or more characters, by its last four characters.
The detection SHALL prefer recall: a value it cannot rule out as plainly not a secret is captured,
because a miss stays in the transcript and a false positive is one vault entry the person removes.
It SHALL run these passes in order, and a later pass SHALL skip any text an earlier one claimed:

1. a `{{secret:...}}` placeholder is claimed and never captured;
2. every block from `-----BEGIN <label>-----` to the matching `-----END <label>-----`, or to the end
   of the text when the end line is missing, of any label, and a PuTTY key from
   `PuTTY-User-Key-File-` to its `Private-MAC:` line, is one secret;
3. a known token shape (GitHub, GitLab, npm, Anthropic, OpenAI, AWS, Slack, Stripe, Google, JWT, a
   connection string's password, and the prefix rules taken from gitleaks' rule data) is a secret,
   whatever its checksum;
4. a value of 6 or more characters after a name that says credential, joined to it by `=`, `:`,
   `:=`, `=>`, `is` or `je`, or as a quoted JSON key, is a secret, and the value runs to the next
   space or quote; a credential name counts when one of its parts (`GITHUB_TOKEN`, `clientSecret`)
   is a credential word, in English (`token`, `secret`, `password`, `pwd`, `passphrase`,
   `credentials`, `auth`, `api_key`, `Bearer`) or in Czech (`heslo`, `klic`, `klíč`, `tajne`,
   `tajné`), so `authorization_mode` and `passwordless` do not; a value is not a secret only when it
   is `true`, `false` or `null`, a template (`<x>`, `${x}`, `{x}`, `{{x}}`), one character repeated,
   a run of the alphabet or the digits, or `changeme`, `example`, `your-` followed by a word;
5. a bare token of 32 or more characters is a secret when its Shannon entropy is at least 0.8 of
   what a random token of its length and alphabet averages, a hex run measured against the hex
   alphabet, unless it is a path, a URL or a dotted name, an id (`session_`, `toolu_`, `cap_`,
   `msg_`), a 40-character hex commit or a UUID, a `sha256-` or `sha256:` style hash, a name
   (separators at a tenth of its length or more, or camelCase words of four letters or more on
   average), or base64 of text (decoding to printable bytes).

Each captured secret SHALL carry a kind: `private-key` for a block whose label ends in `PRIVATE KEY`
or `PRIVATE KEY BLOCK` and for a PuTTY key, `openvpn-key` for `OpenVPN Static key V1`, `pem-block`
for any other block label, the shape's name for a known shape, `credential-value` after a credential
name, `random-token` for a bare token. A public key line (`ssh-ed25519 AAAA...`) is never captured.
On the labelled corpus in `lib/capture.corpus.ts` the capture SHALL keep recall 1.0 and precision of
at least 0.85; the test `lib/capture.test.ts` asserts both, as a guard against a regression, not a
measure on text the corpus does not hold. Every key-material case SHALL be made by running its real
producer (`openvpn`, `ssh-keygen`, `openssl`, `gpg`) in a sandbox when the test runs, so no key sits
in the repository; a producer that is not installed fails the test and names the tool. A prompt with
no secret SHALL pass down unchanged. The person SHALL see a toast naming each id and its kind. The
hook SHALL act only on a prompt the person typed or pasted (origin `composer`, `bridge`, `sdk` or
`channel`); a prompt of any other origin (a task notification, a subagent hand-back, a schedule,
another session) is text the engine or a model wrote, so it SHALL pass down unchanged and the debug
log SHALL name its origin. The limit SHALL be stated: the terminal already showed the text, and a
secret sent before this hook existed is not recalled.

A secret pasted as `name=value`, with the name matching `[a-z][a-z0-9-]{1,40}`, SHALL be stored in
the namespace `qsm` under the key `<name>`, and the prompt SHALL show `{{secret:qsm/<name>}}` in
place of the whole `name=value`; a bare value keeps `cap_<hex>`. A name that is already stored SHALL
NOT be overwritten: the value is stored under `cap_<hex>`, the text keeps `name=`, and the toast
names the name and says it was already stored. A placeholder of the form `{{secret:qsm/<name>}}`
SHALL work wherever `{{secret:<id>}}` does: in a command, in a mask, in the transcript scrub.

A capture that fails SHALL stop the prompt: the hook drops it with a message naming the cause and
the fix (`qsm-secrets doctor`), and never lets an unchecked prompt in.

#### Scenario: a pasted token is replaced by its id before the prompt enters the session

- **WHEN** a prompt contains a 40-character token of a known shape
- **THEN** the prompt that enters the session holds the id and the last four characters and not the
  token, and the token is stored in the backend

#### Scenario: a short secret shows no suffix

- **WHEN** a prompt contains a secret shorter than 20 characters that matches a known shape
- **THEN** the replacement holds the id and no characters of the secret

#### Scenario: a prompt with no secret is not changed

- **WHEN** a prompt contains ordinary text
- **THEN** it passes down byte for byte

#### Scenario: a UUID or a commit hash is not a secret

- **WHEN** a prompt contains a UUID such as `2eb0df0a-348c-44d9-bf8c-30a179d15b5e` or a 40-character
  commit hash
- **THEN** it passes down byte for byte, because on this machine both are ids, never credentials

#### Scenario: a prompt that is not the person's own is not captured

- **WHEN** a task notification holding a session id in a path reaches `prompt.submit`
- **THEN** it passes down byte for byte, `qsm-secrets capture` is not run, and the debug log
  names the origin

#### Scenario: a path or a placeholder is not a secret

- **WHEN** a prompt contains a path such as
  `/tmp/claude-1000/-home-qs_m4rk-Projects-FullStack-qsm-qsm-marketplace--claude-worktrees-rewrite/s`,
  or a `{{secret:cap_<hex>}}` placeholder, or a `session_` id
- **THEN** it passes down byte for byte, and a placeholder is never captured into a new id

#### Scenario: a pasted name=value is stored under that name

- **WHEN** the person pastes `deploy-key=<a known token shape>`
- **THEN** the value is stored in namespace `qsm` as key `deploy-key`, and the prompt holds
  `{{secret:qsm/deploy-key}}` and the last four characters, not the name's value

#### Scenario: a name that already exists is not overwritten

- **WHEN** the person pastes `github-token=<token>` and `github-token` is already stored in `qsm`
- **THEN** the stored entry is untouched, the value is stored as `cap_<hex>`, the prompt holds
  `github-token={{secret:cap_<hex>}}`, and the toast says the name was already stored

#### Scenario: a failed capture stops the prompt and names its cause

- **WHEN** `qsm-secrets capture` fails for a prompt the person typed
- **THEN** the prompt is dropped with a message holding the cause and `qsm-secrets doctor`, the log
  holds the verb, the exit code and the outcome code or stderr, and neither holds the prompt

#### Scenario: the transcript holds the id and not the value

- **WHEN** the session's transcript is saved to the archive after a secret was pasted
- **THEN** the archive holds the id and not the value

#### Scenario: an OpenVPN static key is one secret

- **WHEN** a prompt holds the output of `openvpn --genkey secret`
- **THEN** the whole block from its BEGIN line to its END line is one secret of kind `openvpn-key`,
  and the prompt holds one placeholder in its place

#### Scenario: a certificate is one entry, not one per line

- **WHEN** a prompt holds a certificate made by `openssl req -x509`
- **THEN** the block is one secret of kind `pem-block`, and no line inside it becomes a second
  entry

#### Scenario: a private key in an ovpn file is caught with its neighbours

- **WHEN** a prompt holds an `.ovpn` file with `<ca>`, `<key>` and `<tls-auth>` sections
- **THEN** three secrets are captured, one per block, and the lines outside the blocks pass down
  unchanged

#### Scenario: a Czech password is caught

- **WHEN** a prompt holds `heslo je Xk9pQ2mL` or `HESLO=Xk9pQ2mL`
- **THEN** the value is captured as `credential-value` and the word `heslo` stays in the text

#### Scenario: a template is not a secret

- **WHEN** a prompt holds `password=<your-password>`, `token=${GITHUB_TOKEN}` or `secret=changeme`
- **THEN** it passes down byte for byte

#### Scenario: a GitHub token with a wrong checksum is still caught

- **WHEN** a prompt holds a `ghp_` token of the right length whose last six characters are not its
  CRC32
- **THEN** it is captured as `github-pat`, because a shape that matches is a secret

#### Scenario: an unfinished block is captured to the end

- **WHEN** a prompt holds the BEGIN line of an OpenSSH private key and its key lines but no END line
- **THEN** everything from the BEGIN line to the end of the prompt is one secret of kind
  `private-key`
