# Usage

```bash
qsm-worktrunk ahead [--json]
qsm-worktrunk doctor [--json]
```

`doctor` says whether `wt` and `git` are on PATH: `missing` (4) when one is not, else healthy.

Prints the local branches that hold commits the working branch does not, one name per line, empty
when none. Outside a git repository the answer is none. Without `git` on PATH the exit is `missing`
(4); a git that fails is `failed` (1).

With `--json`, stdout is one envelope `{ code, exit, reason, message, warnings, data }`, `data` an
array of branch names.

From a hooks module: `await $.worktrunk.ahead()`.
