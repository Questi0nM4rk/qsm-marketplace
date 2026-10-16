# Usage

```bash
qsm-cockpit tasks [--json]
qsm-cockpit doctor [--json]
```

`doctor` says whether the task tool (`br`) is on PATH: `missing` (4) when it is not, else healthy.

Prints one line per in-progress task of the working directory's tracker: `<id> <title>`. Without
the task tool on PATH the exit is `missing` (4); a task tool that exits non-zero is `failed` (1).

With `--json`, stdout is one envelope `{ code, exit, reason, message, warnings, data }`, `data` an
array of `{id, title}`.

From a hooks module: `await $.cockpit.tasks()`.
