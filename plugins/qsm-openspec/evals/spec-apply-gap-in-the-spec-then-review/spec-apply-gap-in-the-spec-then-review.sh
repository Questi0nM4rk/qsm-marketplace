#!/usr/bin/env bash
set -euo pipefail
mkdir -p openspec/changes/session-expiry/specs/sessions src
cat > package.json <<'EOF'
{ "name": "sessions", "type": "module" }
EOF
cat > openspec/changes/session-expiry/proposal.md <<'EOF'
## Why
Sessions never end, so a stolen cookie works forever.

## What changes
Idle sessions expire and are removed.

## Critiques
- Devil's advocate: users lose work on expiry. Fixed: expiry only counts idle time.
- Archaeologist: why 30 minutes. Fixed: the number is stated in the delta spec.
- Scope sniper: no refresh tokens. Waived, out of scope.
EOF
cat > openspec/changes/session-expiry/design.md <<'EOF'
Sessions live in src/sessions.ts. A session stores lastSeen. The clock is injected so tests need no sleeping.
EOF
cat > openspec/changes/session-expiry/specs/sessions/spec.md <<'EOF'
## ADDED Requirements

### Requirement: Idle sessions expire
The system SHALL treat a session idle for 30 minutes as expired.

#### Scenario: Idle session is refused
- **WHEN** a session was last seen 31 minutes ago and is used
- **THEN** it is refused as expired

### Requirement: Expired sessions are removed
The system SHALL remove expired sessions from the store.

#### Scenario: Gone after an hour of silence
- **WHEN** an hour passes with no request from a session
- **THEN** the session is no longer in the store
EOF
cat > openspec/changes/session-expiry/tasks.md <<'EOF'
- [ ] 1. A session records lastSeen on every use; verify: bun test covers it
- [ ] 2. A session idle over 30 minutes is refused; verify: bun test covers it
- [ ] 3. Expired sessions leave the store; verify: bun test covers it
EOF
cat > src/sessions.ts <<'EOF'
export interface Session {
  id: string;
  lastSeen: number;
}

export class Sessions {
  readonly store = new Map<string, Session>();
  constructor(private readonly now: () => number) {}

  create(id: string): Session {
    const s = { id, lastSeen: this.now() };
    this.store.set(id, s);
    return s;
  }

  use(id: string): Session | undefined {
    return this.store.get(id);
  }
}
EOF
cat > src/sessions.test.ts <<'EOF'
import { expect, test } from "bun:test";
import { Sessions } from "./sessions";

test("a created session can be used", () => {
  const s = new Sessions(() => 0);
  s.create("a");
  expect(s.use("a")?.id).toBe("a");
});
EOF
