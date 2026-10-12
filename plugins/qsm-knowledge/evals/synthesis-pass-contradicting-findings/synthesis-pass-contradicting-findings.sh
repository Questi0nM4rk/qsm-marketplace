#!/usr/bin/env bash
set -euo pipefail
mkdir -p drafts
cat > findings.md <<'EOF'
# Findings: monolith or microservices

- F1. Teams adopt microservices mainly to let teams deploy independently. Source: [A] Newman, Building Microservices, ch. 1.
- F2. Below about ten developers, a single deployable ships faster and costs less to run. Source: [B] a 2021 engineering blog post, "We went back to a monolith".
- F3. Splitting added network latency to the checkout path. Source: [C] the same blog post, table 2.
- F4. Splitting reduced checkout latency because hot paths scaled alone. Source: [D] a conference talk, minute 31.
- F5. Distributed transactions are the usual cost of a split. Source: [A] ch. 5.
EOF
