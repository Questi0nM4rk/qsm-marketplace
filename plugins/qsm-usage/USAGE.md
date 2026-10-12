# Usage

`--json` on any verb prints one envelope `{ code, exit, reason, message, warnings, data }`. Exit:
0 ok, 1 bad input, 2 bad call, 4 something missing.

```bash
qsm-usage count <file...> [--total] [--stdin] [--mode exact [--model <m>]]
qsm-usage toon size   <file> [--frontmatter | --table --section <heading>]
qsm-usage toon encode <file> [--frontmatter | --table --section <heading>]
qsm-usage toon decode <file.toon>
qsm-usage toon wrap --stdin < output.txt
qsm-usage report findings.json --out report.html
qsm-usage doctor
qsm-usage drop <topic>:<target>
qsm-usage dropped
```

- `count` estimates offline by default; `--mode exact` needs `ANTHROPIC_API_KEY` and exits 4
  without it (never a silent estimate).
- `toon` reads format from the extension (`.json`, `.yaml`, `.yml`, `.toml`); anything else is an
  error. Run `size` first: a ratio above 1 means TOON is larger.
- `wrap` is the TOON hook's decision: structured text over about 1,000 tokens that shrinks by 20%
  or more becomes TOON, else the original is kept.
- `report` validates a findings JSON (level, window, topics with findings) and renders one
  self-contained HTML file; it names the first bad field and writes nothing on failure.
- `doctor` checks `qsm-usage` and the output filter (`QSM_FILTER_BIN`).
- `drop` records a finding the person dropped in a review, `dropped` lists them; a later review
  does not offer a listed finding. The file is `usage/dropped.json` under the qsm state dir.

From a hooks module: `$.usage.count({ files })`, `$.usage.toonEncode({ file })`, `$.usage.report({
file, out })`.
