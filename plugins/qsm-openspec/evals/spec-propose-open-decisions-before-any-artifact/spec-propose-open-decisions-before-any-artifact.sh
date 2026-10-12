#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > README.md <<'EOF'
# ledger-api
Small Express service. Runs as three instances behind a load balancer. Every client has an API key.
EOF
cat > src/auth.ts <<'EOF'
// Every request carries an API key; the key identifies the client.
export function clientOf(req: { headers: Record<string, string> }): string {
  const key = req.headers["x-api-key"];
  if (!key) throw new Error("401");
  return key;
}
EOF
cat > src/server.ts <<'EOF'
import { clientOf } from "./auth";

export function handle(req: { path: string; headers: Record<string, string> }) {
  const client = clientOf(req);
  return { status: 200, body: "ok for " + client + " " + req.path };
}
EOF
br init >/dev/null 2>&1
br create "Platform hardening" -t epic --silent >/dev/null 2>&1
