#!/usr/bin/env bash
set -euo pipefail
mkdir -p openspec/specs/billing openspec/changes/add-refund-limit/specs/billing src
cat > package.json <<'EOF'
{ "name": "billing", "type": "module" }
EOF
cat > openspec/specs/billing/spec.md <<'EOF'
# Billing Specification

## Purpose
Billing issues invoices and refunds.

## Requirements

### Requirement: Invoices are numbered
The system SHALL number invoices sequentially without gaps.

#### Scenario: Next invoice
- **WHEN** an invoice is issued
- **THEN** it gets the next number

### Requirement: Refunds are bounded
The system SHALL refund at most the amount paid.

#### Scenario: Over-refund
- **WHEN** a refund exceeds the amount paid
- **THEN** it is refused

### Requirement: Payments are retried
The system SHALL retry a failed payment three times, one day apart.

#### Scenario: Third failure
- **WHEN** the third retry fails
- **THEN** the subscription is suspended
EOF
cat > openspec/changes/add-refund-limit/proposal.md <<'EOF'
## Why
Support saw one order refunded forty times.
EOF
cat > openspec/changes/add-refund-limit/specs/billing/spec.md <<'EOF'
## MODIFIED Requirements

### Requirement: Refunds are bounded
The system SHALL refund at most the amount paid, and at most 10 refunds per order.

#### Scenario: Over-refund
- **WHEN** a refund exceeds the amount paid
- **THEN** it is refused

#### Scenario: Eleventh refund
- **WHEN** an order already has 10 refunds
- **THEN** another refund is refused

## ADDED Requirements

### Requirement: Refunds are audited
The system SHALL record who issued each refund.

#### Scenario: Audit entry
- **WHEN** a refund is issued
- **THEN** an audit entry names the user who issued it
EOF
cat > openspec/changes/add-refund-limit/tasks.md <<'EOF'
- [x] 1. Refund count per order is enforced
- [x] 2. Refunds are audited
EOF
cat > src/refund.ts <<'EOF'
export function canRefund(paid: number, refunded: number, count: number, amount: number): boolean {
  return refunded + amount <= paid && count < 10;
}
EOF
cat > src/refund.test.ts <<'EOF'
import { expect, test } from "bun:test";
import { canRefund } from "./refund";

test("refund over the paid amount is refused", () => {
  expect(canRefund(100, 0, 0, 101)).toBe(false);
});
test("the eleventh refund is refused", () => {
  expect(canRefund(100, 10, 10, 1)).toBe(false);
});
EOF
br init >/dev/null 2>&1
EPIC=$(br create "Billing hardening" -t epic --silent)
OTHER=$(br create "Unrelated platform epic" -t epic --silent)
br create "Refund limit and audit" -t task --parent "$EPIC" --external-ref openspec:add-refund-limit -d "Support saw one order refunded forty times." >/dev/null
br create "Feedback: refund audit needs the actor id" -t task --parent "$EPIC" --external-ref openspec:add-refund-limit >/dev/null
br create "Test it: refund limit and audit end to end" -t task --parent "$EPIC" >/dev/null
br create "Move invoices to a new PDF renderer" -t task --parent "$OTHER" >/dev/null
