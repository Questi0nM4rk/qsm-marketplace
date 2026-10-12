#!/usr/bin/env bash
set -euo pipefail
mkdir -p stuff misc tests
cat > README.md <<'EOF'
# thing
Run it.
EOF
cat > stuff/mgr.ts <<'EOF'
import { h } from "../misc/util2";
export class Mgr {
  d: any = {};
  go(x: any, y?: any) {
    const r = h(x);
    if (y) this.d[r] = y;
    return this.d[r] ?? r;
  }
}
EOF
cat > misc/util2.ts <<'EOF'
export const h = (s: any) => String(s).split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
export const k = 42;
EOF
cat > stuff/svc.ts <<'EOF'
import { Mgr } from "./mgr";
import { k } from "../misc/util2";
const m = new Mgr();
export function run(a: string) {
  return m.go(a, k) + m.go(a);
}
EOF
cat > tests/test1.ts <<'EOF'
import { run } from "../stuff/svc";
import { expect, test } from "bun:test";
test("t", () => { expect(run("a")).toBeDefined(); });
EOF
