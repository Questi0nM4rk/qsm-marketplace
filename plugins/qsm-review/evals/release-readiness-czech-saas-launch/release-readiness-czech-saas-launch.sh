#!/usr/bin/env bash
set -euo pipefail
mkdir -p src .github/workflows docs
cat > README.md <<'EOF'
# fakturka
Invoices for Czech freelancers. Subscription, paid by card through a payment processor.
EOF
cat > package.json <<'EOF'
{ "name": "fakturka", "version": "0.3.0", "license": "UNLICENSED",
  "dependencies": { "express": "4.19.2", "libpdf-gpl": "2.1.0" } }
EOF
cat > THIRD_PARTY.md <<'EOF'
- express, MIT
- libpdf-gpl, GPL-3.0, renders the invoice PDFs
EOF
cat > .github/workflows/ci.yml <<'EOF'
name: ci
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun test
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - run: ./deploy.sh production
EOF
cat > src/track.ts <<'EOF'
// Loaded on every page view, hosted in the US.
export function loadSessionRecording() {
  const s = document.createElement("script");
  s.src = "https://recorder.example-us.com/rec.js";
  document.head.appendChild(s);
}
loadSessionRecording();
EOF
br init >/dev/null 2>&1 || true
