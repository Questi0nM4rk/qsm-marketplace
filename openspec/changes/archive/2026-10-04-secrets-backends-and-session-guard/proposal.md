## Why

qsm-secrets keeps a credential out of the agent's context, but only when the agent cooperates: a
token pasted into the chat reaches the model, a raw reader such as `rbw get` is blocked only by a
classic Bash guard, and there is one backend, `rbw` against Bitwarden. The original marketplace
used `secret-tool` (libsecret, a local keyring) and a person who wants a machine that never talks
to a network has no way to say so. This change makes the backend a choice, makes the local choice
strictly local, and lets the harness itself carry secrets so the agent needs no discipline.

## What Changes

- **A backend interface** with five operations (set, has, deliver to a command, list names,
  remove), two implementations (`rbw`, `secret-tool`), one conformance test run against both.
- **The backend is chosen at activation**: `qsm-setup activate qsm-secrets --backend
  bitwarden|libsecret`, asked when absent, kept in `setup.json`, overridden by
  `QSM_SECRETS_BACKEND`. Bitwarden stays the default and the way to a self-hosted Vaultwarden with
  mobile and browser ingestion.
- **libsecret is strictly local**: it never touches the network and never falls back to `rbw`. A
  one-command daemon check asks the session bus for `org.freedesktop.secrets` and answers `missing`
  naming what to start.
- **Listing returns names only**, for both backends (libsecret's `search` prints values, so the
  adapter reads attributes and drops the value).
- **The guard is a function hook** that denies raw readers and the rendered-config directory.
- **A pasted secret is captured**: a `prompt.submit` hook finds a known token shape, stores it in
  the chosen backend under a generated id, and passes down the prompt with the id and, for a secret
  of 20 or more characters, its last four characters.
- **An id is replaced at use**: `{{secret:<id>}}` in a Bash command becomes an environment variable
  of that one command, and a tool result that holds a stored value is masked before the model reads
  it. Both depend on a measurement of what `tool.call` may rewrite (see design.md, open decision 1).
- **Config files are rendered per session**: `qsm-secrets render <template>` writes under
  `XDG_RUNTIME_DIR/qsm-secrets/<session>/` at mode 0600 and the session end deletes it.

Not in this change: auto-unlock of a vault, a password manager's features, resistance to a
malicious agent that may run any code after the person unlocks the vault, a second store beside the
chosen one, retroactive removal of a secret that left earlier, and the migration of hooks to
function hooks (the change `hooks-as-function-hooks`, which this one waits on for its guard and
capture tasks).

## Capabilities

### New Capabilities

None. Every requirement lands in the existing `qsm-secrets` capability.

### Modified Capabilities

- `qsm-secrets`: a backend choice with two implementations, a stricter local mode, a names-only
  listing, and a session guard that captures, replaces and masks.

## Impact

- `plugins/qsm-secrets/` (`lib/backend.ts`, `lib/libsecret.ts`, `lib/rbw.ts`, `hooks/register.tsx`,
  `scripts/`, `qsm.json`, `skills/qsm-secrets/SKILL.md`), `qsm-setup` activation (the asked choice,
  blocked by `qsm-1rj2.1`), `setup.json`.
- A person who already uses `rbw` keeps it: the default does not change.

## Critiques

Devil's advocate:

- A paste hook sees the text only after the terminal showed it, so the secret was on the screen and
  possibly in the shell's scrollback. Waived with the limit stated in the spec: the hook protects
  the model and the transcript, not the terminal.
- A false positive replaces ordinary text with an id and stores a non-secret. Fixed: only known
  token shapes and entropy above a stated floor match, a replaced prompt is announced in a toast,
  and a stored id is removable with `qsm-secrets rm`.
- Putting a value into a command's environment still exposes it to any process of the same user.
  Waived: the spec says so; the scope is accidental disclosure, as in the deferred Bitwarden plan.

Future archaeologist:

- Why two backends? Fixed: the design states that libsecret exists for a machine that must stay
  local and that nothing else uses it.
- Why a four-character suffix? Fixed: the design gives the rule (20 or more characters) and the
  reason (it identifies a key without narrowing it).

Scope sniper:

- The rendered config and the output masking could be a later change. Waived: they are separate
  tasks behind the capture task, and either can be dropped without touching the rest.
- The placeholder rewrite may be unnecessary when `pipe` and `env` verbs exist. Recorded as open
  decision 1, to be settled by the measurement before task 7 starts.
