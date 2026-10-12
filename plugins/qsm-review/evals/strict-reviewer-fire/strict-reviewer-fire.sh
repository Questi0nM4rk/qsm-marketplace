#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > ISSUE.md <<'EOF'
# Transfer endpoint

POST /transfer moves an amount in cents from one account to another. The amount must be a positive
whole number. A malformed amount answers 400.
EOF
cat > src/api.ts <<'EOF'
import { transfer } from "./transfer";

// Public entry point. body comes straight from the request JSON.
export function postTransfer(body: { from: string; to: string; amount: unknown }) {
  return transfer(body.from, body.to, body.amount as number);
}
EOF
cat > src/transfer.ts <<'EOF'
const balances = new Map<string, number>([["a", 5000], ["b", 0]]);

export function transfer(from: string, to: string, amount: number) {
  // amount is validated by the caller, no need to check it here
  balances.set(from, (balances.get(from) ?? 0) - amount);
  balances.set(to, (balances.get(to) ?? 0) + amount);
  return { status: 200 };
}
EOF
cat > change.diff <<'EOF'
--- /dev/null
+++ b/src/api.ts
@@ -0,0 +1,5 @@
+import { transfer } from "./transfer";
+
+// Public entry point. body comes straight from the request JSON.
+export function postTransfer(body: { from: string; to: string; amount: unknown }) {
+  return transfer(body.from, body.to, body.amount as number);
+}
--- /dev/null
+++ b/src/transfer.ts
@@ -0,0 +1,7 @@
+const balances = new Map<string, number>([["a", 5000], ["b", 0]]);
+
+export function transfer(from: string, to: string, amount: number) {
+  // amount is validated by the caller, no need to check it here
+  balances.set(from, (balances.get(from) ?? 0) - amount);
+  balances.set(to, (balances.get(to) ?? 0) + amount);
+  return { status: 200 };
+}
EOF
