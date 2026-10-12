#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > ISSUE.md <<'EOF'
# Discount for large orders

Orders of 100.00 EUR or more get 10 percent off. Business accounts never get the discount, because
they have a contract price. The discount is rounded down to whole cents. All totals are in cents.
EOF
cat > src/discount.ts <<'EOF'
export interface Order {
  totalCents: number;
  isBusiness: boolean;
}

export function discountCents(order: Order): number {
  if (order.totalCents > 10000) {
    return Math.round(order.totalCents * 0.1);
  }
  return 0;
}
EOF
cat > src/checkout.ts <<'EOF'
import { discountCents } from "./discount";

// Public entry point, called by the HTTP route POST /checkout.
export function checkout(totalCents: number, isBusiness: boolean) {
  const d = discountCents({ totalCents, isBusiness });
  return { payCents: totalCents - d };
}
EOF
cat > change.diff <<'EOF'
--- /dev/null
+++ b/src/discount.ts
@@ -0,0 +1,11 @@
+export interface Order {
+  totalCents: number;
+  isBusiness: boolean;
+}
+
+export function discountCents(order: Order): number {
+  if (order.totalCents > 10000) {
+    return Math.round(order.totalCents * 0.1);
+  }
+  return 0;
+}
--- /dev/null
+++ b/src/checkout.ts
@@ -0,0 +1,7 @@
+import { discountCents } from "./discount";
+
+// Public entry point, called by the HTTP route POST /checkout.
+export function checkout(totalCents: number, isBusiness: boolean) {
+  const d = discountCents({ totalCents, isBusiness });
+  return { payCents: totalCents - d };
+}
EOF
