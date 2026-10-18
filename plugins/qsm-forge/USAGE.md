# Usage

```bash
qsm-forge gh status 12
qsm-forge gl reply 7 42 --message "Fixed in abc1234"
qsm-forge gh submit-review 12 --file review.json
```

`qsm-forge gh --help` and `qsm-forge gl --help` list verbs and flags. `--json` prints one envelope
on stdout.

`qsm-forge gh comments <pr> --json` also carries, per comment, where and when it was written: `url`,
`createdAt`, `updatedAt`, `authorAssociation`, `authorType` (`User`, `Bot`), `reviewId`, `commit`
and `originalCommit` (the commit it sits on now and the one it was written on), and `commentLine`,
`originalLine`, `startLine`, `originalStartLine`. A value GitHub does not have is `null`. The text
columns do not change.

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
