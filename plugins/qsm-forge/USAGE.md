# Usage

```bash
qsm-forge gh status 12
qsm-forge gl reply 7 42 --message "Fixed in abc1234"
qsm-forge gh submit-review 12 --file review.json
```

`qsm-forge gh --help` and `qsm-forge gl --help` list verbs and flags. `--json` prints one envelope
on stdout.

Review payload (`--file`, or stdin):

```json
{
  "decision": "request-changes",
  "body": "Two things before this merges.",
  "inline": [{ "path": "src/a.ts", "line": 42, "body": "This leaks the handle on the error path." }]
}
```

`decision` is `comment`, `approve` or `request-changes`; `body` is required unless `approve`. A
bad payload posts nothing.

Exit codes: 0 ok, 1 the forge or its CLI refused, 2 bad call (nothing posted), 4 no repository or
project named, or unreadable `--file`.
