# Usage

`qsm-openspec <verb> [options]`. `--json` prints one envelope
`{ code, exit, reason, message, warnings, data }`. Exit codes: `ok` 0, `usage` 2,
`missing` 4 (a `--root` that is not a directory).

## doctor

```bash
qsm-openspec doctor [--root <dir>]
```

Reports the upstream CLI version and any `openspec-*` skills or `opsx*` commands the project
carries. `ok`, or `missing` (exit 4) when the `openspec` binary is not on PATH; the report still
prints.
