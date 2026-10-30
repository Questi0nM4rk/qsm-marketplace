# qsm-ccr Specification

## Purpose

qsm-ccr runs another provider's model inside Claude Code, through a local claude-code-router
(CCR), as an interactive tmux teammate or as a lead, with the person's whole marketplace loaded,
while every Claude session stays on the subscription and no Claude traffic passes through the
router. The provider today is OpenAI Codex through the ChatGPT login (`codex-api`). The `codex` CLI
owns that provider's tokens and model list; qsm-ccr copies them into CCR, guards the person's Claude
settings against CCR, and launches.

Terms used below. **User settings** is `settings.json` in the Claude home (`CLAUDE_CONFIG_DIR`,
else `.claude` in the home directory). **CCR config** is the JSON value CCR keeps in its sqlite
database (table `app_config`, key `default`, column `value_json`) in CCR's home
(`CCR_INTERNAL_HOME_DIR`, else `.claude-code-router` in `HOME`). **Codex home** is `CODEX_HOME`,
else `.codex` in the home directory; it holds `auth.json`, `models_cache.json` and `config.toml`.
**Catalog** is the `models` list of `models_cache.json`. **Allowlist** is the `models` list of the
`codex-api` provider in CCR config; CCR refuses an id not in it. **Router environment** is the set
`ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_MODEL`,
`ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`,
`CLAUDE_CODE_MAX_CONTEXT_TOKENS`, `CLAUDE_CODE_SUBAGENT_MODEL` and `ANTHROPIC_SMALL_FAST_MODEL`;
every launch removes all of them, and a routed launch then sets the ones its route needs.

## Requirements

### Requirement: No Claude traffic passes through the router

qsm-ccr SHALL send a request to the router only for a model in a provider allowlist, and SHALL NOT
configure, route or launch any Claude model through CCR. Every launch whose model is a Claude model
SHALL run with none of the router environment set, whatever the parent process held.

#### Scenario: A Claude teammate of a GPT lead runs on the subscription

- **WHEN** a lead started by `qsm-ccr lead` spawns a teammate named `researcher`
- **THEN** the teammate's `claude` process holds none of the router environment and answers
  through the subscription

#### Scenario: A Claude model is never routed

- **WHEN** `qsm-ccr lead sonnet` runs
- **THEN** it answers `missing` naming `sonnet` as absent from every allowlist, and starts nothing

#### Scenario: CCR config that would carry Claude traffic is a doctor failure

- **WHEN** CCR config holds a provider whose base URL is Anthropic's API, or a route to a Claude
  model
- **THEN** `qsm-ccr doctor` answers `failed` naming the provider or the route

### Requirement: The binary is also the teammate launcher, recognised by its arguments

Claude Code starts every tmux teammate as `$CLAUDE_CODE_TEAMMATE_COMMAND --agent-id <id>
--agent-name <name> --team-name <team> --parent-session-id <id> --agent-type <type>
--permission-mode <mode> [--model <alias>]`, with one executable path and no arguments of ours. The
`qsm-ccr` binary SHALL be that executable: when its first argument begins with `--` and its
arguments carry `--agent-name`, it SHALL run as the teammate launcher; otherwise it SHALL parse a
verb. No verb begins with `--`, so the two never collide. Teammate mode is not a verb: it has no
entry in `qsm.json` and no noun method, and `qsm-ccr --help` SHALL name it. The launcher SHALL run
`claude` from `PATH` with the terminal's stdio, forward its signals, exit with its exit code, pass
every argument it does not rewrite through unchanged, and append one line per launch (time, agent
name, provider or `claude`, model, outcome) to `launch.log` in its state directory, with no
credential in it. A launch that cannot be prepared, a file that does not parse included, SHALL be
refused with its outcome and its `launch.log` line, never end in a stack trace.

#### Scenario: A teammate launch is recognised

- **WHEN** the binary runs with `--agent-id a@t --agent-name gpt-review --team-name t ...`
- **THEN** it launches `claude` as the teammate and parses no verb

#### Scenario: A launch without an agent name is refused loud

- **WHEN** the binary runs with a first argument beginning with `--` and no `--agent-name`
- **THEN** it answers `usage` naming `--agent-name`, starts nothing, and the line is in
  `launch.log`

#### Scenario: Unknown teammate arguments pass through

- **WHEN** Claude Code adds an argument the launcher does not know
- **THEN** the teammate's `claude` receives it unchanged

### Requirement: A teammate's name selects its provider and model

A teammate name SHALL route when it begins with a registered provider prefix. The registered
prefixes SHALL be one table in the plugin's code; its one entry is `gpt-`, served by `codex-api`.
Within a routed name, the longest allowlist slug that the name equals or begins with followed by
`-` SHALL select the model; otherwise the provider's default model SHALL be used: the first catalog
model with `visibility: list` in the catalog's priority order. No model id SHALL be written in the
plugin's code or config. A name with no registered prefix SHALL launch plain `claude`.

#### Scenario: A slug in the name selects the model

- **WHEN** the allowlist holds `gpt-6.1-sol` and a teammate is named `gpt-6.1-sol-reviewer`
- **THEN** it runs on `codex-api,gpt-6.1-sol`

#### Scenario: A role-only name takes the default

- **WHEN** a teammate is named `gpt-reviewer` and no allowlist slug begins its name
- **THEN** it runs on the first `visibility: list` model of the catalog

#### Scenario: Verification that the default is codex's own default

- **WHEN** the default is computed from a freshly synced catalog
- **THEN** it equals the model `codex` itself uses when run without a model; if it does not, the
  priority order is read the way codex reads it and this requirement is corrected

#### Scenario: The default has drifted out of the allowlist

- **WHEN** the catalog's default model is not in the allowlist
- **THEN** the launch answers `missing` naming the model and `qsm-ccr sync`, and starts nothing
- **WHEN** an allowlist lists a Claude model or alias (`claude-*`, `opus`, `sonnet`, `haiku`,
  `fable`) and a launch resolves to it
- **THEN** the launch answers `missing` naming it as a Claude model, and starts nothing

### Requirement: A routed launch carries the router environment and any other carries none

One function SHALL build the environment for every launch, lead or teammate. For a routed model it
SHALL set `ANTHROPIC_BASE_URL` to the router's address from CCR config, `ANTHROPIC_API_KEY` to the
gateway key CCR stores for local clients (read at launch, never written to disk by qsm-ccr, never
printed), `ANTHROPIC_MODEL` and the three `ANTHROPIC_DEFAULT_*_MODEL` tiers to
`<provider>,<slug>`, and `CLAUDE_CODE_MAX_CONTEXT_TOKENS` to the model's catalog `context_window`;
a routed teammate's `--model` argument SHALL be dropped, because the Agent tool's `model` is a
Claude alias. For a Claude launch it SHALL remove every variable of the router environment and keep
`--model`.

#### Scenario: A routed teammate does real work on the router

- **WHEN** a Claude lead spawns `gpt-review` with `--model sonnet`
- **THEN** the teammate's `claude` runs without `--model`, with the router environment set,
  answers, lists the marketplace's skills, runs Bash, and messages the lead

#### Scenario: A Claude teammate loses the forwarded router address

- **WHEN** the parent environment holds `ANTHROPIC_BASE_URL` and a teammate is named `planner`
- **THEN** the teammate's `claude` holds none of the router environment and keeps `--model`

#### Scenario: Verification that the context window reaches a teammate

- **WHEN** a routed teammate starts
- **THEN** its context indicator uses the catalog's `context_window`; if Claude Code ignores the
  variable for teammates, the variable is dropped from teammate launches and this requirement says
  so

### Requirement: The lead verb runs an interactive Claude Code on a routed model

`qsm-ccr lead [<slug>] [-- <claude arguments>]` SHALL start an interactive `claude` with the
terminal's stdio, the routed environment for `<slug>` (default as for a teammate), and
`CLAUDE_CODE_TEAMMATE_COMMAND` set to its own binary path (the running binary when compiled, else
the `qsm-ccr` on `PATH`), so the lead's teammates route by name. It SHALL exit with `claude`'s exit
code when that is 128 or over (a signal; Ctrl-C stays 130), on every outcome that follows `claude`'s
exit; any other non-zero exit of `claude` SHALL answer `failed` (exit 1) naming `claude`'s code in
its message, because the outcome table gives exits 2 to 5 meanings of their own. It SHALL ensure the
daemon first (see the daemon requirement). It replaces any hand-written shell function: qsm-ccr
ships no shell function and edits no shell rc file.

#### Scenario: A GPT lead with a Claude teammate

- **WHEN** `qsm-ccr lead` starts and its model spawns a teammate named `researcher`
- **THEN** the lead answers through the router and the teammate through the subscription

#### Scenario: A slug outside the allowlist

- **WHEN** `qsm-ccr lead gpt-unknown` runs
- **THEN** it answers `missing` naming the slug and the allowlist, and starts nothing

#### Scenario: Claude exits with a code that is not a signal

- **WHEN** `claude` exits 4 under `qsm-ccr lead`
- **THEN** the lead answers `failed`, exits 1, and its message names `claude exited 4`

### Requirement: A lead never writes its model into user settings

A lead started by `qsm-ccr lead` SHALL leave the `model` key of user settings as it found it, so a
subscription session started afterwards keeps its default model. Which action of a routed lead
writes `model` (startup with `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`, or a `/model` pick) is
unverified; the implementation SHALL find it and prevent it, candidates being a per-launch
`--model` with a separate `--settings` source, or clearing the discovery variable for the lead.
Until then the lead SHALL compare `model` after `claude` exits and answer `failed` naming the value
when it changed (worded as "model changed while the lead ran": another session's `/model` lands
there too), or naming the file when it no longer parses, and SHALL NOT rewrite it.
`qsm-ccr doctor` SHALL answer `failed` when user settings `model` names a router model: a
`<provider>,<slug>` pair, a gateway id (`anthropic/claude-ccr-...`), or a catalog slug. Doctor
SHALL name the value and SHALL NOT rewrite it.

#### Scenario: Verification that startup leaves the model alone

- **WHEN** user settings holds `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1` and a lead starts,
  answers one prompt and exits
- **THEN** user settings `model` is byte-identical to before

#### Scenario: Verification that a model pick leaves the model alone

- **WHEN** a lead's person picks another model with `/model` and exits
- **THEN** user settings `model` is byte-identical to before

#### Scenario: A router model in user settings is a doctor failure

- **WHEN** user settings holds `"model": "anthropic/claude-ccr-<hex>"`
- **THEN** `qsm-ccr doctor` answers `failed` naming the key and the value

### Requirement: The teammate command reaches every lead session

Activation SHALL write `CLAUDE_CODE_TEAMMATE_COMMAND`, the absolute path of the `qsm-ccr` binary
found on `PATH`, into the `env` block of user settings, so every lead session the person starts
routes teammates by name. That Claude Code applies a settings `env` value to the process
environment before it spawns a teammate is unverified. When it does not, the requirement SHALL
change to the fallback: the README names the one-line launch
`CLAUDE_CODE_TEAMMATE_COMMAND="$(command -v qsm-ccr)" claude`, and activation writes nothing to
the `env` block.

#### Scenario: Verification that the settings value reaches the teammate spawn

- **WHEN** activation has run and a plain `claude` lead, started with no such variable in its
  shell, spawns a tmux teammate
- **THEN** `launch.log` holds that teammate's line; if it does not, the fallback above applies

#### Scenario: The command points at no executable

- **WHEN** the path in user settings no longer names an executable
- **THEN** `qsm-ccr doctor` answers `missing` naming the path and the activation to rerun

### Requirement: No CCR profile is global before any daemon start

A CCR profile with scope `global` rewrites user settings `env` and `apiKeyHelper` on every daemon
start and every config save, which moves Claude traffic off the subscription. Activation SHALL set
every profile in CCR config, the `claude-code` and the `codex` profile included, to a non-global
scope and disabled, before any daemon start it causes. On a machine where CCR config does not exist
yet, activation SHALL let CCR create it in a daemon started with `HOME` set to a throwaway
directory and `CCR_INTERNAL_HOME_DIR` and `CLAUDE_CONFIG_DIR` unset, stop that daemon, set the
guard in the created config, move the config into CCR's real home, and remove the throwaway
directory, so CCR's schema stays CCR's and no write reaches the real user settings. qsm-ccr SHALL
NOT start the daemon while any profile is global.

#### Scenario: Verification that the throwaway home catches the first start

- **WHEN** activation runs on a machine with no CCR config and then `qsm-ccr lead` starts the daemon
- **THEN** user settings is byte-identical to before activation, and CCR config holds no global
  profile

#### Scenario: A global profile blocks the start

- **WHEN** a launch needs the daemon and CCR config holds a global profile
- **THEN** it answers `blocked` naming the profile and the activation, and the daemon is not
  started

### Requirement: Every daemon start is proven harmless, and refused over damage

qsm-ccr SHALL start the daemon only through one ensure step, shared by `lead` and the teammate
launcher, that runs under a lock in its state directory so concurrent launches start one daemon. The
lock SHALL be one the kernel releases when its holder exits however it exits (`flock` on a file that
is never removed), so no stale lock is ever taken over; a taker SHALL wait longer than a holder may
hold it (codex's refresh, two starts, three stops), and a wait that runs out SHALL answer `blocked`
naming the lock, never crash. Before starting, ensure SHALL answer `blocked`, and start nothing,
when user settings holds a router value: an `env` value pointing at the router's address (a loopback
host or the router's own host) or containing the gateway key, an `ANTHROPIC_BASE_URL`,
`ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` key whatever its value (also when CCR config is
absent), or an `apiKeyHelper` naming CCR. `qsm-ccr doctor` applies the same test. qsm-ccr SHALL
report such damage and SHALL NOT remove it; the person removes it. A daemon counts as running only
when its port answers and the `service.json` in CCR's home names a live pid whose service, at the
loopback url the file names, answers CCR's management RPC as CCR does for its own `ccr stop`
(`getAppInfo` names Claude Code Router, or `getServiceIdentity` with the file's service token
matches that pid); a port another process holds, a stale file included, SHALL make ensure answer
`blocked` naming the address, before any sync, start or launch, and doctor SHALL name it. A running
daemon, whoever started it, SHALL meet the same global-profile and damage checks before a launch
uses it, and a reload SHALL run them before it stops the daemon. After starting, ensure SHALL wait a
moment for CCR to apply its profiles, then compare `env`, `apiKeyHelper` and `model` in user
settings and in every file a `claude-code` profile writes when global (its `settingsFile`, `~` read
as `HOME` the way CCR reads it, and CCR's default `~/.claude/settings.json`) with their values
before the start, and on any difference SHALL stop the daemon and answer `failed` naming each file
and changed key. Stopping SHALL be proven: `ccr stop`, then SIGTERM to the start this run spawned
(its process group) and to the pid in `service.json` only once proven CCR's (alone, never as a
group), then the port must close; a start whose port does not open within 20 seconds SHALL be
stopped the same way; and an answer SHALL say the daemon still runs, naming its address, whenever
the port stayed open.

#### Scenario: Two teammates start at once

- **WHEN** a lead spawns two `gpt-` teammates while the daemon is down
- **THEN** one daemon starts and both teammates run on it

#### Scenario: A dead holder never blocks the lock

- **WHEN** the lock file names a process that holds no lock, or its holder was killed
- **THEN** the next taker takes it at once, and takers that start together never hold it at once

#### Scenario: Damage already in user settings

- **WHEN** user settings `env` holds `ANTHROPIC_BASE_URL` pointing at the router
- **THEN** ensure answers `blocked` naming the key and the file, and the file is unchanged

#### Scenario: A start that wrote user settings is undone and loud

- **WHEN** the daemon start changes user settings `env`, or the `~/.claude/settings.json` of
  `HOME` while `CLAUDE_CONFIG_DIR` names another home, also a moment after its port opens
- **THEN** the daemon is stopped and ensure answers `failed` naming each changed key

#### Scenario: Another process on the router's port

- **WHEN** a process that is not CCR's daemon listens on CCR's port
- **THEN** a routed launch answers `blocked` naming the address, and runs no sync, no `ccr` and no
  `claude`

#### Scenario: A stale service.json names a stranger

- **WHEN** `service.json` names a live pid that is not CCR's (a reboot reused it) while another
  process listens on CCR's port
- **THEN** ensure answers `blocked` naming the address, and no signal reaches that pid or its
  process group, a reload included

#### Scenario: A daemon that outlives its stop is named running

- **WHEN** a start that changed settings, or a reload, meets a daemon that `ccr stop` and SIGTERM
  leave listening
- **THEN** the answer is `failed` saying the daemon still runs at its address, never that it was
  stopped or reloaded

### Requirement: codex is the sole owner of the tokens and the catalog

`qsm-ccr sync` SHALL make CCR's copy match codex's, in this order: answer `blocked` when codex's
`config.toml` names `model_catalog_json`, because codex then echoes a static list; answer `missing`,
naming CCR's own import of Codex, when CCR config has no `codex-api` provider, before any codex
call; run codex's own catalog refresh (`codex debug models`, never `--bundled`); answer `failed`
naming the cache when `models_cache.json` is then older than 24 hours; copy the token fields of
`auth.json`, read after the refresh because codex may rotate them during it, into the `codex-api`
provider's OAuth fields in CCR config; set the allowlist to every catalog slug with
`visibility: list`, and answer `failed` keeping the allowlist when the catalog lists none; reload
the daemon when it runs and a field changed. With no `auth.json` it SHALL answer `missing` naming
`codex login`. It SHALL print no token: a file that does not parse is named with its path and format
only, never with the parser's message, which can quote the value it choked on. Every sync, one that
throws included, SHALL append its outcome to `sync.log`. Doctor SHALL compare the refresh token CCR
holds with codex's, without printing either, and answer `failed` when they differ, naming
`codex login` then `qsm-ccr sync`, because two holders of one refresh chain end in
`refresh_token_reused`.

#### Scenario: Verification that the refresh call writes a fresh cache

- **WHEN** `models_cache.json` is older than 24 hours and `sync` runs
- **THEN** its `fetched_at` is within the last minute; if codex served its cache instead, sync
  answers `failed` and the refresh call is replaced by one that does refresh

#### Scenario: Tokens codex rotates during its refresh are the ones copied

- **WHEN** `codex debug models` rewrites the refresh token in `auth.json`
- **THEN** CCR config holds the rewritten token and doctor's token check answers ok

#### Scenario: A file that does not parse is named, its value never printed

- **WHEN** `auth.json` or `config.toml` holds an unquoted token
- **THEN** sync answers `failed` naming the file, `sync.log` holds the line, and no output or log
  holds the token

#### Scenario: A new model becomes launchable

- **WHEN** the catalog gains a `visibility: list` slug and `sync` runs
- **THEN** the allowlist holds the slug and a teammate named with it answers

#### Scenario: Verification of whether CCR persists a refreshed token

- **WHEN** CCR's copy of the access token is made to expire and a routed request runs
- **THEN** the result is recorded in this requirement: if CCR persists a new refresh token, sync
  keeps CCR's access token from ever expiring by running daily, and doctor's divergence check is
  the guard

#### Scenario: A token about to expire is reported

- **WHEN** codex's access token expires within 24 hours after the refresh call
- **THEN** sync answers `worse` naming the expiry time and no token

### Requirement: Sync writes CCR config so CCR keeps it

`sync` and activation SHALL write CCR config through CCR's management interface when CCR offers one
for these fields; otherwise they SHALL write `value_json` directly as text (`CAST(? AS TEXT)`),
because a blob value makes CCR reset its config to defaults without a word. Each write SHALL change
only the fields its requirement names and leave every other field of CCR config as it was. CCR's
daemon and UI write the same database, so a write SHALL wait out a busy database for a few
seconds, and SHALL compare the stored value with the one it read inside one write transaction:
when CCR saved in between, it writes nothing and answers `failed` naming the concurrent save. `sync`
SHALL reload the daemon only when a field it owns changed, because a reload drops requests in
flight.

#### Scenario: A written config survives a daemon restart

- **WHEN** sync writes the allowlist and the daemon restarts
- **THEN** CCR config holds the written allowlist, every other field unchanged, and no global
  profile

#### Scenario: Nothing changed, nothing reloaded

- **WHEN** sync runs twice in a row with no change at codex
- **THEN** the second run reloads nothing and answers ok

### Requirement: Sync runs at router start and in the background once a day

Ensure SHALL run `sync` before every daemon start it makes; a sync that answers `failed`, `missing`
or `blocked` SHALL stop that start with sync's outcome, and one that answers `worse` (the copy was
made, only the token's expiry is near) SHALL be printed to stderr while the start proceeds. A
function hook on `session.start` SHALL call `$.ccr.sync({ ifStale: true, detach: true })`, where
stale means the last successful sync is older than 24 hours; `--detach` SHALL start the sync in a
detached `qsm-ccr sync --if-stale` process and return at once, appending the outcome to `sync.log`
in the state directory; `--if-stale` SHALL judge the last good sync again once the lock is held, so
syncs queued behind one that just finished run nothing. A hook failure SHALL be toasted as
`qsm-ccr ERROR: session.start: <reason>`, logged, and the session goes on. Sync and ensure SHALL
share the lock.

#### Scenario: A fresh sync is not repeated

- **WHEN** a session starts 2 hours after a successful sync
- **THEN** the hook answers ok and codex is not run

#### Scenario: A background sync that failed is visible

- **WHEN** a detached sync fails
- **THEN** `sync.log` holds `failed: <reason>` and `qsm-ccr doctor` names it

### Requirement: codex runs on its native configuration

The person uses `codex` only so CCR can reach OpenAI models, so codex's own `config.toml` SHALL not
carry CCR's settings. Activation SHALL disable CCR's `codex` profile; that CCR then restores
`config.toml` itself is unverified, so activation SHALL afterwards remove every key CCR wrote into
it: `model_provider` when it names CCR, `model_catalog_json` when it names CCR's catalog file, the
`base_url`, `experimental_bearer_token` and `wire_api` that belong to CCR, and each
`[model_providers.<id>]` table named for CCR or with a `base_url` at the router. Every other line
SHALL stay as the person wrote it. Before the first edit activation SHALL copy the file beside
itself (`config.toml.qsm-ccr.bak`, never replaced afterwards), and it SHALL name each removal. A
second run SHALL remove nothing. The edited text SHALL be parsed before it is written, and a
removal that would leave a CCR key behind (a quoted key, a value over several lines) SHALL be an
`error` naming the file and the key, left as it was. A `config.toml` that does not parse SHALL be an
`error` naming the file, left as it was.

#### Scenario: Verification of CCR's own restore

- **WHEN** activation disables the `codex` profile and the daemon starts once
- **THEN** the result is recorded: either `config.toml` holds no `model_catalog_json`, or
  activation's own removal does, with every other line unchanged

#### Scenario: A catalog override is a doctor failure

- **WHEN** `config.toml` names `model_catalog_json`
- **THEN** `qsm-ccr doctor` answers `failed` naming the key, and `sync` answers `blocked`

### Requirement: Requests reach codex without fields it rejects

A request Claude Code sends through the router SHALL reach `codex-api` without a field the codex
backend rejects; Claude Code always sends `metadata`. Whether CCR still needs a custom router that
deletes it is unverified. When it does, activation SHALL write that router as a file in the
plugin's state directory from text inside the binary, and ensure SHALL start the daemon with
`CUSTOM_ROUTER_PATH` naming it.

#### Scenario: Verification that the custom router is needed

- **WHEN** a routed teammate's first request is sent with no custom router configured
- **THEN** the result decides: an answer drops the custom router from this requirement, a
  rejection naming `metadata` keeps it

### Requirement: Doctor reports every seam and starts nothing

`qsm-ccr doctor` SHALL run every check, make no network call, start nothing, write nothing, print
no credential, and report each check with its outcome and cause: `claude`, `ccr` and `codex` on
`PATH`; no global CCR profile; no Claude provider or route in CCR config; no router value in user
settings `env` or `apiKeyHelper` and no router model in its `model`; the teammate command names
this binary; codex's `config.toml` names no `model_catalog_json`; `auth.json` present; the token
copies agree; the catalog's default model in the allowlist; the last `sync.log` outcome; whether
the daemon runs. A daemon that is not running SHALL be ok, because ensure starts it on demand.
Each check SHALL run on its own: a check that throws (a file that does not parse) is its own
`failed` row naming the file, and every other check still runs.

#### Scenario: Drift is missing with the name

- **WHEN** the catalog's default model is absent from the allowlist
- **THEN** doctor answers `missing` naming the model and `qsm-ccr sync`, and every other check
  still runs

#### Scenario: Files that do not parse are rows, not a crash

- **WHEN** `auth.json` and CCR config do not parse
- **THEN** doctor answers a `failed` row for each naming the file, and the tool, settings and
  sync checks still run

#### Scenario: A healthy machine

- **WHEN** every check passes and the daemon is down
- **THEN** doctor answers ok and names the daemon as not running

### Requirement: Activation changes the person's files, by choice, and says what it would change

`qsm-setup activate qsm-ccr` SHALL run `scripts/activate.ts`, an `Activation` with no options:
it sets the CCR profile guard (bootstrapping CCR config when absent), detects the `codex-api`
provider with its OAuth plugin in CCR config and, when it is missing, answers `missing` naming
CCR's own Codex import (it never copies CCR's internals to create one), wires the custom router
when needed, returns codex to its native configuration, writes the teammate command into user
settings `env`, and runs a first `sync` unless an earlier step did not complete. Every file of the
person's it writes (codex's `config.toml` and its backup, user settings, the CCR config it creates)
SHALL be replaced whole or not at all: written to a temp file in the same directory, fsynced and
renamed, with the file's own mode kept (a new file is `0600`), and no temp file left when the write
fails. `--dry-run` SHALL name each change and write nothing; `--status` SHALL answer `activated`
when every step holds, `absent` when none does, `differs` otherwise. A settings file that does not
parse SHALL be an `error` naming the file, left as it was. Every other key of user settings SHALL
be left as it was. Install SHALL never run it.

#### Scenario: Dry run writes nothing

- **WHEN** `qsm-setup activate qsm-ccr -- --dry-run` runs
- **THEN** each step names what it would change, and user settings, CCR config and codex's
  `config.toml` are byte-identical

#### Scenario: A second activation changes nothing

- **WHEN** activation runs again with nothing changed
- **THEN** every step is `already` and no file is written

### Requirement: Install places the binary and starts nothing

`scripts/install.ts` SHALL compile and link the `qsm-ccr` binary and the hooks module, probe
`claude`, `ccr` and `codex`, and report each absent one as `missing-prereq` naming its install. It
SHALL NOT run `ccr`, because any CCR invocation can start the daemon before the guard holds, and
SHALL NOT write any file outside the plugin's own build and state directories.

#### Scenario: A fresh machine without CCR

- **WHEN** install runs and `ccr` is not on `PATH`
- **THEN** the step is `missing-prereq` naming the router's install, and no daemon runs

### Requirement: One binary, three verbs, one noun

`qsm-ccr` SHALL be one compiled binary with the verbs `lead`, `sync` and `doctor`, plus teammate
mode, each verb answering with the marketplace's outcome envelope under `--json`. The binary SHALL
read its arguments, `PATH`, `HOME`, `XDG_STATE_HOME` (its state directory is `qsm-ccr` there),
`CLAUDE_CONFIG_DIR`, `CODEX_HOME` and `CCR_INTERNAL_HOME_DIR`, `QSM_CCR_START_WAIT_MS`,
`QSM_CCR_SETTLE_MS` and `QSM_CCR_STOP_WAIT_MS` (the daemon's start, settle and stop waits, which a
test shortens; unset they are 20 s, 1 s and 10 s), and in teammate mode the environment it
rewrites, and nothing else of the process that runs it. The hooks module SHALL be
`hooks/register.tsx`, calling only its generated `$.ccr` noun.

#### Scenario: Run with no harness

- **WHEN** `qsm-ccr doctor` runs from a plain shell
- **THEN** it answers with the envelope and needs no harness

### Requirement: Dependencies

qsm-ccr SHALL declare no plug-in in the `dependencies` array of its plugin.json: no skill, hook or
verb of it calls another plug-in. Its prerequisites are upstream tools, not plug-ins: Claude Code
(`claude`), claude-code-router (`ccr`) and the Codex CLI (`codex`), each reported `missing` with
its install when absent.

#### Scenario: The plugin is installed alone

- **WHEN** qsm-ccr is installed
- **THEN** `claude plugin install` installs no other plug-in with it

## Out of scope

- A Claude model, or the Anthropic subscription, through CCR.
- Patching, forking or wrapping the `claude` binary beyond the teammate launch.
- `claude -p` workers: an interactive teammate is the unit.
- In-process teammates: they share the lead's environment and cannot be routed.
- claude.ai remote and cloud sessions, and any second harness.
- Signing in to a provider: `codex login` is codex's, and qsm-ccr only copies its result.
- A shell function, a tier mapping, or any hardcoded model id: the catalog decides.
- The auto permission classifier: it is Claude Code behaviour, a separate model call per decision
  through whatever the session routes to (about 40k input tokens, measured once). qsm-ccr does not
  touch it; the README names the cost as a caveat.
- Undoing activation: the README names the keys to remove.

## Extension points

Each is one more row in the provider-prefix table and one more allowlist source behind `sync`,
none a rewrite. Neither ships until the person decides where its API key lives.

- OpenRouter: model list from its public `GET /api/v1/models`.
- OpenCode Zen: model list source unverified; models.dev is a candidate.

## Libraries

| Need                         | Pick                                                                                                                                        | Why                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| CCR config                   | CCR's management interface if it has one for providers (unverified), else `bun:sqlite` writing text                                         | CCR owns the schema; a blob write resets CCR config to defaults. |
| codex `config.toml`          | `Bun.TOML.parse` to read, a one-key line edit to write                                                                                      | Every other line stays as the person wrote it.                   |
| Token expiry                 | the access token's JWT `exp`, decoded                                                                                                       | No library; the value is never printed.                          |
| CLI verbs, flags, help, noun | root `lib/cli-base.ts`                                                                                                                      | The marketplace's one parser over `qsm.json`.                    |
| Tests                        | `bun test` with throwaway `HOME`, `CODEX_HOME`, `CCR_INTERNAL_HOME_DIR` and `CLAUDE_CONFIG_DIR`, stub `claude`, `ccr` and `codex` on `PATH` | Nothing touches the person's real settings, router or tokens.    |
