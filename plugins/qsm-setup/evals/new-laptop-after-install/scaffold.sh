#!/usr/bin/env bash
# The project the person works in on the new machine: TypeScript, shell scripts, a CI workflow.
mkdir -p src scripts .github/workflows
cat > package.json <<'JSON'
{ "name": "billing-api", "type": "module", "scripts": { "test": "bun test" },
  "dependencies": { "zod": "^4.0.0" }, "devDependencies": { "typescript": "^5.6.0" } }
JSON
cat > src/invoice.ts <<'TS'
export function total(lines: { qty: number; price: number }[]): number {
  return lines.reduce((sum, l) => sum + l.qty * l.price, 0);
}
TS
cat > scripts/deploy.sh <<'SH'
#!/bin/sh
set -e
scp -r dist/ deploy@billing.example.invalid:/srv/billing
SH
cat > .github/workflows/ci.yml <<'YML'
name: ci
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun test
YML
cat > doctor-output.txt <<'TXT'
qsm-setup doctor
PASS qsm-essentials (activated)
PASS qsm-memory (not activated)
PASS qsm-usage
PASS qsm-langdev
PASS qsm-toolbox
WARN orphan: ~/.local/bin/qsm-old-notes (declared by no plugin)
WARN orphan: ~/.local/bin/qsm-vault-sync (declared by no plugin)
FAIL claude path: ~/.local/bin is not on PATH (fix: add it in the shell profile)
summary: 5 pass, 2 warn, 1 fail
TXT
