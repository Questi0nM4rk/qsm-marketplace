# Usage

```bash
qsm-secrets pipe <key> -- <cmd> [args...]
qsm-secrets env <key>=<ENVVAR> -- <cmd> [args...]
qsm-secrets has <key>
qsm-secrets list [--folder <ns>]
qsm-secrets rename <from> <to> [--folder <ns>] [--to-folder <ns>] [--legacy]
qsm-secrets prune [--dry-run]
qsm-secrets check <key>=<ENVVAR> -- <probe> [args...]
qsm-secrets render <template> --out <name>
qsm-secrets set <key> --gui [--folder <f>]
qsm-secrets askpass enable [--sudo] [--ssh] [--git] [--decide]
```

`render` prints the path of the filled file under the session directory; `clean` removes it.
`capture` reads text on stdin and prints it with each secret replaced by its id (`--json` answers
`{ text, captured: [{ id, suffix }], taken: [name] }`; a `name=value` becomes `{{secret:qsm/<name>}}`
and its id is `qsm/<name>`, and a name already stored is listed in `taken` and its value gets a
`cap_<hex>`); `scrub <transcript|session>` replaces captured values left
in a transcript. Neither prints a value.

`guard` reads a Bash command on stdin and answers `ok`, or `blocked` (exit 5) with a code and the
verb to use instead: `vault-reader`, `bus-secrets`, `keyring-files`, `rendered-config`,
`keyring-library`, `credential-file`, `fd3-to-output`, `single-quoted-placeholder`, `askpass-pane` or
`unreadable-command`. The `tool.call` hook calls it; run it by hand to see why a command was refused.

`list` with no `--folder` and no `QSM_SECRETS_FOLDER` prints every namespace, each key as
`<namespace>/<key>`. `rename --legacy` moves an entry that libsecret stored before namespaces
existed (it has none) into `qsm`, or into `--to-folder`; it is blocked when another namespace holds
the same name, because the old entry cannot be told apart from it by its attributes.

`rename` writes the new name, reads it back equal, then removes the old one; an existing target is
refused (exit 5). `prune` removes the capture entries whose id no transcript under
`~/.claude/projects` names and prints each id; `--dry-run` only lists, and run it after your sessions
end, because a live session's capture is named in its transcript only once the prompt is rewritten.
A named key (`qsm/<name>`) is never pruned, and renaming a capture id leaves the old id in transcripts
that name it, where it no longer resolves.
`check` runs the probe like `env` with its output discarded and answers ok, or failed (exit 1)
with the probe's code: `qsm-secrets check npm-token=NPM_TOKEN -- npm whoami`.

`set --gui` collects the value in the askpass pane and hands it to the backend on stdin; nothing
prints but the key. `askpass enable` prints the fish lines that point `SUDO_ASKPASS`,
`SSH_ASKPASS` (with `SSH_ASKPASS_REQUIRE=prefer`), `GIT_ASKPASS` or `HOOK_KIT_ASKPASS` at the
`qsm-askpass-<kind>` links install makes in `$QSM_BIN_DIR`; it writes nothing. A consumer runs
the link (`sudo -A`, ssh, git, hook-kit), which is `qsm-secrets askpass <kind> -- <its prompt>`:
the typed text goes to its stdout on Allow, and Deny, Escape or 120 s without an answer exits 1
with the reason (`denied by the person`, `cancelled by the person`, `timed out waiting for the
person`). ssh with `SSH_ASKPASS_PROMPT=confirm` gets Allow as exit 0 with no text, and with `none` a
notice. The guard refuses an agent's Bash that runs a link or `askpass <kind>` itself (`askpass-pane`).
`decide` reads a hook-kit ask request on stdin and answers an ask response. Without `qs`
on PATH or the installed pane the exit is 4.

Other verbs: `set`, `inspect`, `rm`, `get`, `mask`, `doctor`. `qsm-secrets --help` lists them.
Option scanning stops at `--`, so the consumer keeps its own flags.

Exit codes: 0 ok, 1 consumer or vault failed, 2 bad call, 4 key or prerequisite missing, 5 refused
(`get` without `3>`, `--json` on a value verb, a command `guard` refuses). The consumer's own exit code is `data.exit` in the
`--json` envelope.
