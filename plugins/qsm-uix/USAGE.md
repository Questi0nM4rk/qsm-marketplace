# Usage

`qsm-uix <verb> [options]`; `--help` lists each verb's options.

```bash
qsm-uix screenshot [--output NAME] [--out FILE.png]
qsm-uix crop IN.png --rect X,Y,W,H [--zoom N] [--out OUT.png]
qsm-uix diff A.png B.png [--out DIFF.png]
qsm-uix burst --count N --interval MS --out-dir DIR [--output NAME]
qsm-uix pixel-sample IMG --at X,Y
qsm-uix contrast IMG --fg X,Y --bg X,Y
qsm-uix region-stats IMG --rect X,Y,W,H [--top N]
qsm-uix a11y-tree [APP] [--depth N] [--json]
qsm-uix doctor
```

- `a11y-tree` prints one line per node, `role "name" [focused,focusable,showing]`, indented by
  depth; an app that is not on the bus is `failed`, an unreachable bus is `missing`.
- Text mode prints the numbers on stdout. `--json` prints one envelope,
  `{ code, exit, reason, message, warnings, data }`. A failure prints nothing on stdout.
- Exit codes: `ok` 0, `failed` 1, `usage` 2 (bad call, rect off the image), `missing` 4 (tool
  absent).
- `crop` magnifies with a point filter on purpose. `diff` refuses images of different sizes.
- `contrast` is the WCAG formula: `wcagAaText` at 4.5, `wcagAaLargeOrUi` at 3.
- `burst` frames carry `atMs`, the real elapsed time, not the requested interval.
- Another plugin's hooks module calls the same verbs as `$.uix.<camelCaseVerb>({...})`.
