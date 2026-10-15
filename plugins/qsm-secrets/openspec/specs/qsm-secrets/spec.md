# qsm-secrets Specification

## Purpose

qsm-secrets lets an agent, a human, or a script use a stored credential without the credential's
value ever entering the agent's context or terminal output.

## Requirements

### Requirement: Run a command with the secret on its input

The wrapper SHALL accept a stored key and a consumer command and SHALL deliver
the key's value on the consumer's input stream, so the caller's own output
never carries the value. It SHALL fail, printing no value, when the key is not
stored.

#### Scenario: Piping a stored key to a consumer

- **WHEN** the caller names a stored key and a consumer command
- **THEN** the consumer receives the value on its input stream and its own
  output is all the caller sees

#### Scenario: Key not stored

- **WHEN** the caller names a key that is not stored
- **THEN** the wrapper exits with a failure and no value is printed

### Requirement: Run a command with the secret in one environment variable

The wrapper SHALL accept a stored key, an environment variable name, and a
consumer command, and SHALL run the consumer with only that one variable set
to the key's value in the consumer's own environment. The value SHALL NOT
enter the caller's own environment or any other process.

#### Scenario: Running a consumer with the value as one env var

- **WHEN** the caller names a stored key, a target variable name, and a
  consumer command
- **THEN** the consumer runs with the value under that variable name only

#### Scenario: Key not stored for the environment delivery

- **WHEN** the named key is not stored
- **THEN** the wrapper exits with a failure and the consumer does not run

### Requirement: Store a new secret without it passing through a terminal or a chat

The wrapper SHALL accept a new value only through a prompt the caller enters
by hand, and SHALL NOT accept a secret value as a command-line argument or
piped input. It SHALL fail when the value entered is empty.

#### Scenario: Storing a new key

- **WHEN** the caller asks to store a new key
- **THEN** a prompt collects the value directly from the caller and the
  wrapper reports success without echoing the value

#### Scenario: Prompt dismissed without a value

- **WHEN** the caller closes the prompt without entering a value
- **THEN** the wrapper reports failure and nothing is stored

### Requirement: Check whether a key is stored, with no other output

The wrapper SHALL report only whether a named key exists, as a pass or a
missing-prerequisite result, and SHALL print no value either way.

#### Scenario: Key exists

- **WHEN** the caller checks a key that is stored
- **THEN** the wrapper reports success and prints nothing

#### Scenario: Key missing

- **WHEN** the caller checks a key that is not stored
- **THEN** the wrapper reports the key as missing, naming the key and no value

### Requirement: Browse stored keys without exposing any value

The wrapper SHALL list the names of stored keys in the selected namespace for the chosen backend
and let the caller inspect their metadata, and SHALL NOT include a secret's value in that output
under any input, including a value crafted to imitate metadata formatting or a value spanning
multiple lines. A narrow enumeration SHALL cover only entries this wrapper stored; a full
enumeration SHALL cover every entry in the selected namespace regardless of who stored it.

#### Scenario: Listing keys

- **WHEN** the caller lists the stored keys
- **THEN** the key names are printed and no value is printed

#### Scenario: Inspecting every entry in a namespace

- **WHEN** the caller inspects the full namespace, including an entry stored
  by something other than this wrapper
- **THEN** the wrapper prints that entry's metadata and never its value

#### Scenario: A value engineered to look like metadata

- **WHEN** a stored value contains lines formatted to resemble metadata
  fields, including across multiple lines
- **THEN** none of the value's lines appear in the listing or inspection
  output

### Requirement: Remove a stored key

The wrapper SHALL delete a named stored key on request and SHALL report
failure, not a silent success, when the key was not stored.

#### Scenario: Removing a stored key

- **WHEN** the caller removes a key that is stored
- **THEN** the key is no longer stored and no longer found by any other verb

#### Scenario: Removing a key that was never stored

- **WHEN** the caller removes a key that does not exist
- **THEN** the wrapper reports failure

### Requirement: Rename a stored key without exposing its value

The wrapper SHALL rename a stored key, optionally into another namespace, on both backends, with the
value read and written inside its own process and never printed. It SHALL write the new entry and
read it back equal before it removes the old one, and SHALL refuse, as blocked, a target that is
already stored.

#### Scenario: Renaming a stored key

- **WHEN** the caller renames a stored key to a new name, or with `--to-folder` into another folder
- **THEN** the new name holds the same value, the old name is no longer stored, and no value is
  printed

#### Scenario: The target already exists

- **WHEN** the caller renames a key to a name that is already stored
- **THEN** the wrapper refuses with `blocked` and both entries are unchanged

#### Scenario: A libsecret entry stored before namespaces existed is moved

- **WHEN** an entry with no namespace is stored and the caller runs `rename <key> <new> --legacy`
- **THEN** the entry is stored under `qsm` (or `--to-folder`) with the same value, the old one is
  gone, no value is printed, and the error that `list` and `mask` raise for such an entry names
  `qsm-secrets rename <key> <new> --legacy`

#### Scenario: A legacy entry shares its name with a namespaced one

- **WHEN** `rename --legacy` names a key that another namespace also holds
- **THEN** the wrapper refuses with `blocked`, naming that namespace, and both entries are unchanged,
  because the old entry is found and removed by its key alone and would take the other with it

#### Scenario: A legacy entry keeps its name

- **WHEN** `rename --legacy` gives the new entry the same key as the old one
- **THEN** the value is stored under a spare key in the target and read back, the old entry is
  removed, the final key is stored and read back, and the spare one is removed, so at no point is
  the value held only in the process; a leftover spare key is refused as `blocked`

#### Scenario: The copy does not read back equal

- **WHEN** the new entry does not read back equal to the old value
- **THEN** the new entry is removed, the old one is untouched and the wrapper reports failure

### Requirement: Prune captured entries no transcript names

The wrapper SHALL remove every entry of the capture namespace whose id appears in no session
transcript under `~/.claude/projects`, print each removed id and never a value, and with `--dry-run`
only list them. It SHALL refuse, as missing, when there is no transcript to check against, because
every id would then look unused.

#### Scenario: An unnamed capture is pruned

- **WHEN** a captured entry's id appears in no transcript and the caller runs prune
- **THEN** the entry is removed, its id is printed, entries of other namespaces and ids a
  transcript names are kept, and a second run removes nothing

#### Scenario: A dry run changes nothing

- **WHEN** the caller runs prune with `--dry-run`
- **THEN** the ids that would be removed are listed and every entry is still stored

#### Scenario: No transcript to check against

- **WHEN** no transcript exists under `~/.claude/projects`
- **THEN** the wrapper reports missing and removes nothing

### Requirement: Check a credential with a probe

The wrapper SHALL run a probe command with a key's value in one environment variable, exactly as
`env` does, discard the probe's stdout and stderr, and report ok, or failed with the probe's exit
code.

#### Scenario: The probe succeeds or fails

- **WHEN** the caller runs `check <key>=<VAR> -- <probe>`
- **THEN** the wrapper answers ok when the probe exits 0 and failed with its exit code otherwise,
  and neither the probe's output nor the value is printed

### Requirement: Retrieve a raw value only through an explicitly opened channel

The wrapper SHALL offer a last-resort verb that writes a key's value to a
channel the caller must open explicitly, and SHALL refuse to run, with a
hint toward the input/environment verbs, when that channel is not open.

#### Scenario: Caller opened the channel

- **WHEN** the caller opens the dedicated channel before invoking the verb
- **THEN** the value is written there and not to the caller's ordinary output

#### Scenario: Caller did not open the channel

- **WHEN** the caller invokes the verb without opening the channel
- **THEN** the wrapper reports the call as blocked by policy and prints a hint
  toward the input or environment verbs instead of the value

#### Scenario: Machine output asked of a verb that carries a value

- **WHEN** the caller asks for machine output from a verb that delivers or
  writes a value
- **THEN** the wrapper reports the call as blocked by policy, names the input
  or environment verb to use instead, and delivers nothing

### Requirement: Diagnose whether the secret tooling is usable

The wrapper SHALL provide one diagnostic verb that probes every prerequisite
the other verbs depend on, reports each as passed or failed, and gives a next
step for each failed check, without exposing any stored value.

#### Scenario: Everything usable

- **WHEN** every prerequisite is satisfied
- **THEN** the diagnostic verb reports every check passed

#### Scenario: One prerequisite missing

- **WHEN** one prerequisite the wrapper depends on is unavailable
- **THEN** the diagnostic verb reports that check failed as a
  missing-prerequisite result and names the step to fix it, and every other
  check still runs and reports

### Requirement: Select which stored namespace a call reads or writes

The wrapper SHALL default to one namespace of its own and SHALL let the
caller point any verb at a different existing namespace, so secrets stored
under another convention remain reachable by key name.

#### Scenario: Reading from a named alternate namespace

- **WHEN** the caller selects a different existing namespace and names a key
  stored there
- **THEN** the wrapper resolves the key against the selected namespace, not
  its own default

### Requirement: One backend interface, two implementations, one test

qsm-secrets SHALL reach its store through one interface of five operations (set, has, deliver a
value to a command, list names, remove) with two implementations, `bitwarden` (through `rbw`) and
`libsecret` (through `secret-tool`). One conformance test SHALL run against both and SHALL pass for
both before either ships.

#### Scenario: both backends pass the same conformance test

- **WHEN** the conformance test runs against the `bitwarden` and the `libsecret` backend
- **THEN** every operation passes for both

### Requirement: The backend is chosen at activation

`qsm-setup activate qsm-secrets` SHALL take `--backend bitwarden|libsecret`, SHALL ask the person
when it is absent, and SHALL write the choice to `setup.json` only after the person answered.
`QSM_SECRETS_BACKEND` SHALL override the stored choice. A call with no choice stored and none
given SHALL answer `missing` naming the activation. The default offered is `bitwarden`.

#### Scenario: activation without a choice asks and writes nothing

- **WHEN** activation runs with no `--backend` and the person has not answered
- **THEN** it asks, and `setup.json` is unchanged

#### Scenario: the chosen backend is the only one used

- **WHEN** the choice is `libsecret` and a command stores, reads and lists a key
- **THEN** `rbw` is never started

### Requirement: libsecret is strictly local

The `libsecret` backend SHALL make no network call and SHALL NOT fall back to `bitwarden`. Before
its first operation it SHALL check, in one process, that the session bus names
`org.freedesktop.secrets`; when it does not, the call SHALL answer `missing` naming what to start
(a Secret Service provider such as GNOME Keyring or KeePassXC) and SHALL change nothing.

#### Scenario: a stored entry is found whatever order its attributes print in

- **WHEN** the choice is `libsecret`, entries are stored and `secret-tool search` prints each item's
  attributes on stderr in any order
- **THEN** `list`, `has` and `env` find every entry by its namespace and key

#### Scenario: a value cannot forge an entry

- **WHEN** a stored value contains the text `attribute.key = X`
- **THEN** no entry named `X` is listed and the value is never printed

#### Scenario: libsecret never touches the network

- **WHEN** the choice is `libsecret` and any operation runs
- **THEN** no network connection is opened and no `rbw` process starts

#### Scenario: no secret service answers missing

- **WHEN** the session bus does not name `org.freedesktop.secrets`
- **THEN** the call answers `missing` naming a provider to start, and nothing is stored

### Requirement: Listing prints key names and never a value

`list` SHALL print the names of stored keys for both backends. A value SHALL NOT appear in its
output, its error text, or its JSON envelope, whatever the backend's own listing prints.

#### Scenario: list with no namespace named shows every namespace

- **WHEN** `list` runs with no `--folder` and `QSM_SECRETS_FOLDER` unset, on either backend
- **THEN** it prints every key this wrapper stored as `<namespace>/<key>`, the capture namespace
  included, and with a namespace named it prints that namespace's bare key names only

#### Scenario: list never prints a value

- **WHEN** a key holding a value-shaped secret is stored and `list` runs on either backend
- **THEN** the output holds the key's name and not the value

### Requirement: A pasted secret is captured before the prompt enters the session

A function hook on `prompt.submit` SHALL find in the prompt text a known token shape (GitHub,
GitLab, npm, Anthropic, OpenAI, AWS, Slack, Stripe, Google, JWT, a private key block), a value after
a name that says credential (`token`, `secret`, `password`, `api_key`, `Bearer`, and the like) that
is random-looking and not a word or a name, or a bare token of 32 or more characters, SHALL store
each in the chosen backend under a generated id, and SHALL pass down a prompt in which the value is
replaced by `{{secret:<id>}}` followed, for a secret of 20 or more characters, by its last four
characters. A known shape always counts. A bare token SHALL count only when it is none of: inside a
placeholder, a path, a URL or a dotted name, an id (`session_`, `toolu_`, `cap_`, `msg_`), a hash
(hex or hex and hyphens alone, a UUID, `sha256-`), a name (separators at a tenth of its length or
more, or camelCase words of four letters or more on average), base64 of text (decoding to printable
bytes), and when its Shannon entropy is at least 0.9 of what a random token of its length and
alphabet averages. A hex value counts only after a credential name, and a run of digits alone is a
number, not hex. A credential name counts only when one of its parts (`GITHUB_TOKEN`, `clientSecret`)
is a credential word, so `authorization_mode` and `passwordless` do not; the value after a password's
name counts from 6 characters when it mixes letters and digits or cases, and after any other
credential name from 16. A public key (`ssh-ed25519 AAAA...`) is never captured. On the labelled
corpus in `lib/capture.corpus.ts` (74 positives, 106 negatives) the capture SHALL keep precision 1.0
and recall of at least 0.95; the test `lib/capture.test.ts` asserts both, as a guard against a
regression, not a measure of precision on text the corpus does not hold. A prompt with no secret SHALL
pass down unchanged. The person SHALL see a toast naming each id. The hook SHALL act only on a
prompt the person typed or pasted (origin `composer`, `bridge`, `sdk` or `channel`); a prompt of any
other origin (a task notification, a subagent hand-back, a schedule, another session) is text the
engine or a model wrote, so it SHALL pass down unchanged and the log SHALL name its origin. The
limit SHALL be stated: the terminal already showed the text, and a secret sent before this hook
existed is not recalled.

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
- **THEN** it passes down byte for byte, `qsm-secrets capture` is not run, and the log names the
  origin

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

### Requirement: An id is replaced at use

A function hook on `tool.call` for Bash SHALL rewrite a command holding `{{secret:<id>}}` into a
call of `qsm-secrets env <id>=QSM_SECRET_<ID> -- sh -c '<command>'` in which the placeholder is the
variable, so the value reaches that one command through its environment and never appears in the
command text. A command with no placeholder SHALL pass unchanged, and the hook SHALL return the
tool's result as it came, never a copy of it. Two ids of one command whose variable names are the
same (`qsm/a-b` and `qsm/a_b`) SHALL be refused with a message naming both, because the second
value would silently stand in for the first.

#### Scenario: an id in a command is replaced for that command only

- **WHEN** a Bash command holds `{{secret:<id>}}`
- **THEN** that command runs with the value in one environment variable and no other command sees it

#### Scenario: a command with a single quote keeps its meaning

- **WHEN** a Bash command holds `{{secret:<id>}}` and a single quote
- **THEN** the rewritten command runs the same words as the original

#### Scenario: two ids share one variable

- **WHEN** a Bash command holds `{{secret:qsm/a-b}}` and `{{secret:qsm/a_b}}`
- **THEN** the call is denied and the reason names both ids

#### Scenario: a placeholder inside single quotes is denied before it runs

- **WHEN** a Bash command holds `{{secret:<id>}}` inside single quotes, as in `curl -H 'A: {{secret:<id>}}'`
- **THEN** the call is denied with the code `single-quoted-placeholder` and a message to use double
  quotes, and the same placeholder in double quotes, bare, or inside the body of `sh -c '...'` is
  replaced as usual

### Requirement: Every row the conversation keeps is masked

A function hook on `session.append` SHALL mask every row the session keeps, whatever its door (a
tool result, a response, a prompt, an attachment, a delivery), before it is stored: each text block
and each tool result's content has every stored value of every namespace replaced by its
placeholder, `{{secret:<id>}}` in the capture namespace and `{{secret:<namespace>/<key>}}` in any
other. The hook SHALL run one `qsm-secrets mask --all` process per row, which reads the backend
once. A value shorter than six characters SHALL NOT be masked, because it would match inside
ordinary words. When the mask fails, the row's text SHALL be replaced by a notice that it was
withheld and a toast SHALL say so, because a row that could not be masked may hold a value. The
result of every tool takes this door, Read, Grep, an MCP tool and the hand-back of an Agent
included, so none has a list of its own. What cannot be masked is named, because a reader should
not assume it is: a value printed re-encoded (base64, escaped); a value of fewer than six
characters; a value inside a media block (an image or a PDF is kept as it is); the screen, an SDK
stream and Remote Control, which may show a row just before its rewrite; and the structured record
of a tool result and an attachment's payload, which the engine stores as made (the transcript
scrub below covers those two once the session ends).

#### Scenario: a value in a tool result is masked

- **WHEN** a tool result contains a stored value, whether or not its command named an id
- **THEN** the row is stored with the placeholder in its place and the model reads the placeholder

#### Scenario: a printing consumer is masked like any other

- **WHEN** `qsm-secrets env <key>=V -- printenv V` prints the value
- **THEN** the result holds the placeholder and not the value

#### Scenario: a result of Read, Grep, an MCP tool or an Agent is masked

- **WHEN** one of those tools returns text holding a stored value
- **THEN** the row is stored with the placeholder in its place, and a media block in the same result
  is kept as it is

#### Scenario: a file read returns a stored value

- **WHEN** the Read tool returns a file that holds a stored value
- **THEN** the row is stored with the placeholder in its place

#### Scenario: a failed mask withholds the row

- **WHEN** `qsm-secrets mask --all` fails for a row
- **THEN** the row's text is replaced by a withheld notice, a toast says so, and the log names the cause

#### Scenario: one read serves a whole row

- **WHEN** a row has several text blocks
- **THEN** one `mask --all` process masks all of them

#### Scenario: no backend is chosen

- **WHEN** no backend was chosen at activation
- **THEN** nothing can be stored, and `mask --all` returns every string unchanged

#### Scenario: a listed value cannot be read

- **WHEN** a stored key is listed but its value cannot be read, as in a locked vault
- **THEN** `mask --all` fails `blocked` naming the key, and the row is withheld

#### Scenario: an entry of an older schema is stored

- **WHEN** the libsecret store holds a `service=qsm` entry with no `namespace` attribute
- **THEN** listing and `mask --all` fail naming the key and the command that removes it, because
  without a delimiter in `secret-tool` output such an entry would shift its neighbours' namespaces

### Requirement: Config files are rendered per session in memory and removed at its end

`qsm-secrets render <template>` SHALL write the template with its ids replaced under
`XDG_RUNTIME_DIR/qsm-secrets/<session>/`, the directory at mode 0700 and each file at 0600, and the
session end SHALL remove the directory; `qsm-secrets clean` in an environment with no
`XDG_RUNTIME_DIR` SHALL answer ok and remove nothing, because render could not have written there.
The requirement SHALL state its limit: another process of
the same user can read the file while the session lives.

#### Scenario: a rendered file lives only in the session directory

- **WHEN** a template is rendered during a session
- **THEN** the file exists under that session's directory at mode 0600 and nowhere else

#### Scenario: the session end removes it

- **WHEN** the session ends
- **THEN** the session's directory no longer exists

### Requirement: A session end scrubs stored values from the transcript

The engine writes a submitted prompt raw into the transcript before any hook runs, so the session
end SHALL replace every stored value of every namespace still in the transcript, and in the
transcripts of the subagents the session ran, with its placeholder, by rewriting each file atomically
in a detached process, and SHALL print no value: the engine stores a submitted prompt, a tool
result's structured record and an attachment's payload as made, whatever the mask hook rewrote, so
a value named by no placeholder in the file is swapped too. A value of fewer than six characters is
not swapped. The swap
SHALL touch only the text inside a line's string values, never a structural field (`sessionId`,
`uuid`, `parentUuid`, `cwd`, `transcript_path`, `agentId`, a tool use id), because a stored value
equal to an id would otherwise break the resume and the links between transcripts. A scrub that
fails leaves its cause in the log, because it runs detached and its outcome is seen nowhere else.
The
scrub SHALL start before the session directory is removed, so a failed removal cannot skip it, and
the removal SHALL run even when the scrub fails: each step runs and reports on its own, and the
session ends either way.

#### Scenario: the transcript holds the placeholder after the session ends

- **WHEN** a session ends after a secret was pasted and captured
- **THEN** the transcript file holds the placeholder and not the value

#### Scenario: a value stored in a payload the mask cannot reach is swapped

- **WHEN** a session ends and its transcript, or a subagent's, holds a stored value in an
  attachment's payload and no placeholder anywhere
- **THEN** the file holds the placeholder and not the value

#### Scenario: a stored value equal to a session id leaves the structure intact

- **WHEN** a stored value equals the `sessionId` of the transcript line that also quotes it in text
- **THEN** the `sessionId` field is unchanged and the quoted text holds the placeholder

#### Scenario: a failed scrub still removes the rendered files

- **WHEN** the scrub fails at the session end
- **THEN** the session directory is still removed and the log names the scrub's cause

### Requirement: An agent is routed to the wrapper instead of reading a value itself

The assistant SHALL recognize a request for a credential, a token, or a
stored secret and SHALL respond by invoking the wrapper's input or
environment delivery rather than asking for, or reproducing, the value
itself.

#### Scenario: Agent needs a stored credential to run a command

- **WHEN** a task requires a stored credential to complete a command
- **THEN** the assistant runs that command through the wrapper's input or
  environment delivery and never asks the user to paste the value into chat

### Requirement: The guard reads the command's syntax tree and denies raw readers

The verb `qsm-secrets guard` SHALL read a Bash command on stdin, parse it with shell-ast, and answer
`ok` or `blocked` with a stable code, the reason and the `qsm-secrets` verb to use instead. It
SHALL resolve every command through `sudo`, `command`, `env`, `nice`, `timeout`, `xargs`, `setsid`,
`stdbuf`, `flock`, `ionice`, `chrt`, `watch`, `nohup`, `unbuffer`, `taskset`, `find -exec`,
`qsm-secrets env|pipe|check -- <cmd>`, `sh -c` bodies, subshells, command substitutions and
pipelines, and past a backslash in the command's name, so a reader is judged by the command that
finally runs. A path word is judged by its spelling, by a glob that can expand to a protected
directory, and, after a `cd` to a known directory, by the directory it is relative to. `${NAME}` SHALL read as `$NAME` for `HOME`, `XDG_DATA_HOME`,
`XDG_RUNTIME_DIR` and `PASSWORD_STORE_DIR`, and a braced form of one of them with an operator
(`${NAME:-x}`, `${NAME#x}`, `${!NAME}`) SHALL be refused as `unreadable-command`, because its value
cannot be known without running the shell. It SHALL deny `secret-tool` (every verb), `rbw`, `bw`, `pass`, `gopass`, `keepassxc-cli`,
`kwallet-query` and `op`; `busctl`, `gdbus`, `dbus-send`, `dbus-monitor` and `qdbus` when a word names
the secrets service by bus name or object path (`org.freedesktop.secrets`, `org.freedesktop.Secret`,
`/org/freedesktop/secrets`) or holds an expansion, because a destination the guard cannot read could
be that service; a reader of the keyring directory, the vault's data directory or the pass store
(`~/.password-store` and `$PASSWORD_STORE_DIR`), `gpg` included, by the spelling of the path or the
file it resolves to; `python -c` or `node -e` naming a keyring library; a reader of the rendered
config directory; a reader of a credential file; and `qsm-secrets get` with descriptor 3 pointed at
the output. Every refusal names the `qsm-secrets` verb to use instead. The guard is a denylist of
doors to the stored credentials: it does not judge an interpreter's script file (`python3 x.py`),
which is a named gap, not a verdict. A statement with no words (`A=1`) and a redirect with no word
name nothing and are judged as nothing. It SHALL allow `qsm-secrets` itself
otherwise and every ordinary command, and a command it cannot parse is denied with the cause, never
allowed. A function hook on `tool.call` for Bash SHALL run the verb on the command as written, before
the id substitution, through `$.process.run` and deny with the verb's reason; a verb that cannot
answer denies the call and names the cause, except for exactly `qsm-secrets doctor`, so a broken
install can be diagnosed; the person reinstalls in their own terminal, because an allowed path to an
install script is a path the agent could write its own script to. The verb is a compiled binary with the parser embedded,
because the hook sandbox cannot load WebAssembly.

#### Scenario: a raw reader is denied with the wrapper to use

- **WHEN** an agent runs `secret-tool lookup`, `secret-tool store` or `rbw get` through Bash
- **THEN** the call is denied and the reason names its code and `qsm-secrets pipe` or `qsm-secrets env`

#### Scenario: a wrapper does not hide a reader

- **WHEN** an agent runs `sudo env A=1 rbw get x`, `echo a | xargs rbw get`, `bash -c 'ls; rbw get x'`,
  `echo $(rbw get x)`, `\rbw get x`, `flock f rbw get x`, `find . -exec rbw get x ;` or
  `qsm-secrets env k=V -- rbw get x`
- **THEN** the call is denied as a vault reader

#### Scenario: a changed directory or a glob does not hide the keyring

- **WHEN** an agent runs `cd <data dir> && cat keyrings/login.keyring` or `cat <data dir>/keyr*/login.keyring`
- **THEN** the call is denied as keyring files

#### Scenario: every door to a store is closed

- **WHEN** an agent runs `gopass show x`, `keepassxc-cli show db e`, `kwallet-query -r e w`,
  `op read op://v/i/f`, `secret-tool search --all service qsm`, `gpg -d ~/.password-store/x.gpg`,
  or `busctl call <dest> /org/freedesktop/secrets b c`, or a bus tool with `"$DEST"` as its destination
- **THEN** the call is denied, the reason names the `qsm-secrets` verb to use instead, and
  `busctl --user list`, `ls ~/.password-store` and `gpg --list-keys` are not denied

#### Scenario: a lookup is not a run

- **WHEN** an agent runs `command -v rbw`, `which rbw` or `echo rbw get`
- **THEN** the call is not denied

#### Scenario: the keyring files are not read

- **WHEN** an agent runs `cat "$XDG_DATA_HOME/keyrings/login.keyring"`, or a reader on a symbolic link to
  that file
- **THEN** the call is denied as keyring files, and `ls` of the directory is not

#### Scenario: a braced variable is the same path

- **WHEN** an agent runs `cat ${XDG_DATA_HOME}/keyrings/login.keyring`, `cat "${HOME}/.password-store/x"`
  or `cat ${PASSWORD_STORE_DIR}/x`
- **THEN** the call is denied as keyring files, `cat ${XDG_RUNTIME_DIR}/qsm-secrets/s1/kubeconfig` as
  rendered config, `cat ${XDG_DATA_HOME:-/x}/keyrings/login.keyring` as `unreadable-command`, and
  `cat ${HOME}/README.md` is not denied

#### Scenario: the rendered config is handed over, never read

- **WHEN** an agent runs `cat` on a file in the rendered config directory, or passes that file's path
  to `kubectl --kubeconfig`
- **THEN** the `cat` is denied as rendered config and the `kubectl` is not

#### Scenario: a keyring library is not called inline

- **WHEN** an agent runs `python3 -c 'import keyring'` or `node -e` naming `keytar`
- **THEN** the call is denied, and `python3 -m pytest tests/test_keyring.py` is not

#### Scenario: the escape-hatch descriptor is not pointed at the output

- **WHEN** an agent runs `qsm-secrets get <key>` with descriptor 3 redirected to `&1`, `&2` or
  `/dev/stdout`, in the command, around it, or around a shell that runs it
- **THEN** the call is denied, and descriptor 3 redirected to a file is not

#### Scenario: a command that cannot be read is refused

- **WHEN** a command has syntax the parser rejects
- **THEN** the call is denied with the code `unreadable-command` and the parser's message

#### Scenario: a guard that cannot answer stops the call

- **WHEN** the verb prints no outcome envelope
- **THEN** the call is denied and the reason names the verb, its exit code and its stderr, unless the
  command is exactly `qsm-secrets doctor`, which runs

### Requirement: Read, Grep and Glob do not open the credential files

A function hook on `tool.call` for `Read`, `Grep` and `Glob` SHALL deny a path inside the keyring
directory, the vault's data directory, the pass store or the rendered config directory, by its
spelling or the file it resolves to, and a `Grep` whose path holds one of them (with no path, the
session's working directory is judged), and SHALL deny a `Glob` whose path is inside one or whose
pattern starts inside one, judged by its part before the first wildcard and, when that part is
relative, joined to the Glob's path (a `Glob` lists names, like `ls`, so a path above a store is
allowed), and SHALL answer with the wrapper to use instead.

#### Scenario: a file read of the keyring is denied

- **WHEN** an agent reads a file in the keyring directory, or through a link that leads there
- **THEN** the call is denied and the reason names `qsm-secrets pipe`

#### Scenario: a Glob of the pass store is denied

- **WHEN** an agent globs inside `~/.password-store`, or with a pattern that starts there
- **THEN** the call is denied, and a Glob of `src/**/*.ts` is not

#### Scenario: an ordinary file is read

- **WHEN** an agent reads a file outside those directories
- **THEN** the call is not denied

### Requirement: A content denylist is generated per machine, approved, and never committed

The `content-denylist` skill SHALL propose gitleaks rules for employer, client and internal names
and shapes found in the person's local sessions, memory and instruction files, as a table of
pattern, reason and count; SHALL write the file at the path in root `lib/paths.ts` only after the
person approves; and SHALL never print a matched line or a credential.

#### Scenario: The person approves a proposed list

- **WHEN** the person approves rows of the proposed table
- **THEN** exactly those rows are written to the machine-local file, outside every repository

#### Scenario: A candidate has no count

- **WHEN** a name was not found in a local source
- **THEN** it is proposed only if the person added it by hand

### Requirement: A new secret may be collected in a pane the person types into

`qsm-secrets set <key> --gui` SHALL collect the value in the askpass pane, a Quickshell overlay the
person types into, and SHALL hand it to the backend on stdin so the caller never receives it. The
terminal path of `set` SHALL stay as it is. The pane's request SHALL carry no secret value, and the
pane's answer SHALL travel on a one-shot unix socket the binary created, never in argv or stdout.
The call SHALL fail, storing nothing, when the person cancels or denies (`failed`, "cancelled by the
person"), when no answer arrives in 120 seconds (`failed`, "timed out waiting for the person"), or
when the value is empty; and SHALL answer `missing`, with no terminal fallback, when `qs` is not on
PATH or the pane is not installed.

#### Scenario: the person types a value in the pane

- **WHEN** the caller runs `set <key> --gui` and the person types a value and presses Save
- **THEN** the backend holds that value under the key, the call prints `stored <key>`, and the value
  is in no output and in no argv

#### Scenario: the person cancels

- **WHEN** the person presses Escape or Cancel in the pane
- **THEN** nothing is stored and the call fails with "cancelled by the person"

#### Scenario: no answer in time

- **WHEN** 120 seconds pass without an answer
- **THEN** the call fails with "timed out waiting for the person", the pane request is withdrawn and
  the reply socket's directory is removed

#### Scenario: no Quickshell

- **WHEN** `qs` is not on PATH
- **THEN** the call answers `missing`, names `qs`, and stores nothing

### Requirement: Consumers that ask for a password get it from the pane

`qsm-secrets askpass <kind> -- <the consumer's words>` SHALL show one request in the pane and return
the answer in the shape the consumer reads: for `sudo`, `ssh` and `git` the typed text on stdout and
exit 0 on Allow, and no stdout and exit 1 with the reason on Deny, Escape or a timeout; for `decide` an
ask response of hook-kit's protocol 2 with the request's id and `allow` or `deny`, read from an ask
request on stdin. Install SHALL link `qsm-askpass-<kind>` to the binary in the bin directory for each
of those kinds, because the consumers' environment variables (`SUDO_ASKPASS`, `SSH_ASKPASS`,
`GIT_ASKPASS`, `HOOK_KIT_ASKPASS`) hold one executable path with no arguments, and the binary SHALL
read the link's name as the kind. `qsm-secrets askpass enable` SHALL print the fish lines for the
kinds named and write nothing. The pane SHALL show the asking process (the parent): its executable
path, the first 12 hex of the sha256 of that executable and its command line, and SHALL hide the
typed text when the prompt asks for a password, passphrase or secret. The prompt, the subject (the tool
and its whole input for `decide`) and the command line SHALL be shown in full, never cut: what does not
fit its box scrolls and says so, because the person must not allow what part of it hid. `ssh` and
`git` answers are asked once and never stored.

#### Scenario: sudo -A through the link

- **WHEN** a consumer runs `$SUDO_ASKPASS "[sudo] password for me: "` and the person types a password
  and presses Allow
- **THEN** the password is the consumer's stdout followed by a newline and the exit is 0

#### Scenario: the person denies

- **WHEN** the person presses Deny
- **THEN** stdout is empty, stderr says "denied by the person" and the exit is 1

#### Scenario: a hook-kit ask

- **WHEN** hook-kit runs `$HOOK_KIT_ASKPASS` with an ask request on stdin and the person presses Allow
- **THEN** stdout is an ask response with the same id and `allow`

#### Scenario: a long request is shown whole

- **WHEN** a `decide` request carries a 600-character input
- **THEN** the request's subject holds all 600 characters, and the pane wraps it and scrolls with a
  marker when it does not fit

#### Scenario: a second run changes nothing

- **WHEN** install runs twice
- **THEN** the second run reports the pane and every link unchanged, and a link of a kind that no longer
  exists is removed and named

### Requirement: The pane is one component and a table of kinds

The pane SHALL be one QML component driven by one kinds table, and a provider SHALL be one file in
`lib/askpass/providers/` listed in one table in `lib/askpass/index.ts`. Adding a kind SHALL need one row
in each table, a provider file and no other change. The pane SHALL run as a Quickshell instance of its
own, started on demand with `qs -p <installed dir> -n -d` and always addressed with `-p`, so a call never
reaches the desktop shell's instance. The guard SHALL refuse, with the code `askpass-pane`, an agent's
Bash command that is `qs ipc ... askpass`, a `qs ipc` call with an expansion word, a call of a
`qsm-askpass-<kind>` link or of `qsm-secrets askpass <kind>` for a kind that prints its answer (`sudo`,
`ssh`, `git`, `decide`), and any command that names `$XDG_RUNTIME_DIR/qsm-askpass`; the links are entry
points for the consumers that run them themselves, and `sudo -A <cmd>` stays allowed. The pane SHALL
accept a request only when its socket path is `$XDG_RUNTIME_DIR/qsm-askpass/<nonce>/reply.sock` for its
own 128-bit hex nonce, SHALL give each request its own 120 seconds, and the binary SHALL withdraw the
request and remove the directory on SIGTERM, SIGINT and SIGHUP. Install SHALL write the pane only to
the default path, never to the path `QSM_ASKPASS_QML` names.

#### Scenario: an agent calls the pane's target

- **WHEN** an agent runs `qs ipc -p <dir> call askpass request '{...}'` through Bash
- **THEN** the call is denied with `askpass-pane`, and `qs ipc call qsm toggle` is not

#### Scenario: an agent runs the consumer entry point itself

- **WHEN** an agent runs `qsm-askpass-sudo "[sudo] password: "` or `qsm-secrets askpass sudo -- "..."`
  through Bash, or `nc -U $XDG_RUNTIME_DIR/qsm-askpass/<nonce>/reply.sock`
- **THEN** the call is denied with `askpass-pane`, while `sudo -A true` and `qsm-secrets set <key> --gui`
  are not

#### Scenario: a signal ends the call

- **WHEN** the call receives SIGTERM while it waits for the person
- **THEN** the pane request is withdrawn, the reply socket's directory is removed and the exit is 143

#### Scenario: ssh asks a yes or no, or shows a notice

- **WHEN** ssh runs the link with `SSH_ASKPASS_PROMPT=confirm` and the person presses Allow
- **THEN** stdout is empty and the exit is 0; with Deny the exit is 1; with `none` the pane shows the
  prompt as a notice and the exit is 0

## Design

- **One binary.** Iron Law 8 holds: `askpass` is a verb of `qsm-secrets`. A compiled bun binary reports
  the name it was run as in `process.argv0` (measured through a symlink), so install links
  `qsm-askpass-<kind>` to it and the binary rewrites its argv to `askpass <kind> -- <words>`. A shell
  shim would add a file with its own path and hash for nothing; a link also keeps `/proc/<pid>/exe` the
  verified binary.
- **Quickshell on demand.** The pane's QML is copied by install to `$XDG_DATA_HOME/qsm/askpass/qml`
  (Iron Law 9: nothing runs through a path into the repository). The first request starts
  `qs -p <dir> -n -d`; later ones find it. The IPC target is `askpass` and its functions are `request` and
  `withdraw`: `show` is a subcommand name of `qs ipc`, so a function called `show` is parsed as that
  subcommand and the call is refused as a usage error (found in the live run, which a fake `qs` hid).
- **Caller binding.** The binary makes the reply socket in a 0700 directory named by a 128-bit random nonce
  under `$XDG_RUNTIME_DIR/qsm-askpass`, the socket is 0600, the first line whose nonce matches is the answer,
  and the directory is removed in a `finally`. The guard refuses the pane's IPC target from an agent's Bash.
  **Known gap:** peer credentials on the socket are not checked. The nonce and the socket path travel in the
  argv of `qs ipc call`, which any process of the user can read in `/proc/<pid>/cmdline`, so a same-user
  process outside the agent's Bash guard can connect to the real socket and write a forged answer, `allow`
  for `decide` included, while the person still looks at the pane. The pane accepts only the one socket
  path the binary makes, the guard refuses an agent's Bash that names that directory, and the pane's
  display of the asking executable and its hash lets the person notice; nothing stops a determined
  same-user process.
- **`askpass enable` has no `--secrets`.** The secret kind has no environment variable, because it is
  reached through `set --gui`, so `enable` takes `--sudo`, `--ssh`, `--git` and `--decide` only.
- **ssh prompt modes.** `SSH_ASKPASS_REQUIRE=prefer` sends every ssh prompt here, so the ssh provider reads
  `SSH_ASKPASS_PROMPT`: `confirm` is Allow or Deny with exit 0 or 1 and no text, `none` is a notice row
  (`notice` in the kinds tables) with no answer to give.
- **Outcome codes.** Root `lib/outcome.ts` is unchanged: a timeout and a cancel are `failed` with a reason.
- **Theme.** `Theme.qml` is a copy of the desktop shell's Deep Night tokens, a file of this plugin; the pane
  runs without that shell.
- **ssh and git are Authorize-style.** Their answers are a passphrase or a password for a remote, asked once
  and never stored; only `secret` goes to the vault.
- **Sudo timestamp.** A cached sudo credential skips the askpass, so no pane appears; `sudo -k` or
  `timestamp_timeout=0` is the person's setting, documented in INSTALL.md.
- **No test-only submit.** Nothing in the IPC target answers on the person's behalf, because that is the
  same-user bypass; the live run types into the pane with `wtype`.
- **The asking process** is the parent of the binary. For `sudo` that is sudo, which another uid owns, so
  its executable may be unreadable and the pane says so; its command line is the command sudo will run.
