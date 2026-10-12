## ADDED Requirements

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

#### Scenario: libsecret never touches the network

- **WHEN** the choice is `libsecret` and any operation runs
- **THEN** no network connection is opened and no `rbw` process starts

#### Scenario: no secret service answers missing

- **WHEN** the session bus does not name `org.freedesktop.secrets`
- **THEN** the call answers `missing` naming a provider to start, and nothing is stored

### Requirement: Listing prints key names and never a value

`list` SHALL print the names of stored keys for both backends. A value SHALL NOT appear in its
output, its error text, or its JSON envelope, whatever the backend's own listing prints.

#### Scenario: list never prints a value

- **WHEN** a key holding a value-shaped secret is stored and `list` runs on either backend
- **THEN** the output holds the key's name and not the value

### Requirement: The guard is a function hook that denies raw readers

A function hook on `tool.call` for Bash SHALL deny a command that reads a stored value outside the
wrapper (`secret-tool lookup`, `secret-tool search`, `rbw get`, `rbw code`, `bw get`) or reads the
rendered config directory, and SHALL answer with the wrapper command to use instead. It SHALL allow
`secret-tool store` and `secret-tool clear`.

#### Scenario: a raw reader is denied with the wrapper to use

- **WHEN** an agent runs `secret-tool lookup` or `rbw get` through Bash
- **THEN** the call is denied and the reason names `qsm-secrets pipe` or `qsm-secrets env`

#### Scenario: a store is allowed

- **WHEN** an agent runs `secret-tool store`
- **THEN** the call is not denied

### Requirement: A pasted secret is captured before the prompt enters the session

A function hook on `prompt.submit` SHALL find in the prompt text a known token shape, or a token of
32 or more characters whose Shannon entropy is at least 3.5 bits per character, SHALL store each in
the chosen backend under a generated id, and SHALL pass down a prompt in which the value is
replaced by `{{secret:<id>}}` followed, for a secret of 20 or more characters, by its last four
characters. A prompt with no secret SHALL pass down unchanged. The person SHALL see a toast naming
each id. The limit SHALL be stated: the terminal already showed the text, and a secret sent before
this hook existed is not recalled.

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

#### Scenario: the transcript holds the id and not the value

- **WHEN** the session's transcript is saved to the archive after a secret was pasted
- **THEN** the archive holds the id and not the value

### Requirement: An id is replaced at use and a stored value is masked in a result

A function hook on `tool.call` for Bash SHALL rewrite a command holding `{{secret:<id>}}` into a
call of `qsm-secrets env <id>=QSM_SECRET_<ID> -- sh -c '<command>'` in which the placeholder is the
variable, so the value reaches that one command through its environment and never appears in the
command text, and SHALL mask a stored value found in the command's result with its id before the
model reads it. A command with no placeholder SHALL pass unchanged.

#### Scenario: an id in a command is replaced for that command only

- **WHEN** a Bash command holds `{{secret:<id>}}`
- **THEN** that command runs with the value in one environment variable and no other command sees it

#### Scenario: a command with a single quote keeps its meaning

- **WHEN** a Bash command holds `{{secret:<id>}}` and a single quote
- **THEN** the rewritten command runs the same words as the original

#### Scenario: a value in a tool result is masked

- **WHEN** a tool result contains a stored value
- **THEN** the model reads the id in its place

### Requirement: Config files are rendered per session in memory and removed at its end

`qsm-secrets render <template>` SHALL write the template with its ids replaced under
`XDG_RUNTIME_DIR/qsm-secrets/<session>/`, the directory at mode 0700 and each file at 0600, and the
session end SHALL remove the directory. The requirement SHALL state its limit: another process of
the same user can read the file while the session lives.

#### Scenario: a rendered file lives only in the session directory

- **WHEN** a template is rendered during a session
- **THEN** the file exists under that session's directory at mode 0600 and nowhere else

#### Scenario: the session end removes it

- **WHEN** the session ends
- **THEN** the session's directory no longer exists

## MODIFIED Requirements

### Requirement: Browse stored keys without exposing any value

The wrapper SHALL list the names of stored keys in the selected namespace for the chosen backend
and SHALL NOT print any value.

#### Scenario: Listing keys

- **WHEN** the caller lists the stored keys
- **THEN** the key names are printed and no value is printed
