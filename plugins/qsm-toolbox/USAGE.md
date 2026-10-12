# Usage

```bash
qsm-toolbox doctor [--json]
```

Prints one line per catalog tool: `present <bin> <version>` or `missing <bin> (install: <line>)`.
A tool whose version flag fails is still `present`. Exit is always 0; a wrong verb or flag is
`usage` (2).

With `--json`, stdout is one envelope `{ code, exit, reason, message, warnings, data }`, `data` an
array of `{bin, present, version, install}`.

From a hooks module: `await $.toolbox.doctor()`.
