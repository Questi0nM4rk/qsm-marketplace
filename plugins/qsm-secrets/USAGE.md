# Usage

```bash
qsm-secrets pipe <key> -- <cmd> [args...]
qsm-secrets env <key>=<ENVVAR> -- <cmd> [args...]
qsm-secrets has <key>
qsm-secrets list
qsm-secrets render <template> --out <name>
```

`render` prints the path of the filled file under the session directory; `clean` removes it.
`capture` reads text on stdin and prints it with each secret replaced by its id (`--json` answers
`{ text, captured: [{ id, suffix }], taken: [name] }`; a `name=value` becomes `{{secret:qsm/<name>}}`
and its id is `qsm/<name>`, and a name already stored is listed in `taken` and its value gets a
`cap_<hex>`); `scrub <transcript|session>` replaces captured values left
in a transcript. Neither prints a value.

Other verbs: `set`, `inspect`, `rm`, `get`, `mask`, `doctor`. `qsm-secrets --help` lists them.
Option scanning stops at `--`, so the consumer keeps its own flags.

Exit codes: 0 ok, 1 consumer or vault failed, 2 bad call, 4 key or prerequisite missing, 5 refused
(`get` without `3>`, `--json` on a value verb). The consumer's own exit code is `data.exit` in the
`--json` envelope.
