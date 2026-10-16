Replace the `...process.env` spread with `isolatedEnv({ HOME: home })` and
`mkdtempSync(join(tmpdir(), ...))` with `sandboxDir()`.
