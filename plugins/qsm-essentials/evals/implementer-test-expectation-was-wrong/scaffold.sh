#!/usr/bin/env bash
set -euo pipefail
mkdir -p work
cd work
cat > package.json <<'J'
{ "name": "work", "private": true, "scripts": { "test": "bun test", "report": "bun report.ts" } }
J
cat > percent.ts <<'J'
export function percent(done: number, total: number): number {
  return Math.round((done / total) * 100);
}
J
cat > report.ts <<'J'
import { percent } from "./percent.ts";

console.log(`Done: ${percent(1, 3)}%`);
J
cat > percent.test.ts <<'J'
import { expect, test } from "bun:test";
import { percent } from "./percent.ts";

test("one of three is a third", () => {
  expect(percent(1, 3)).toBe(33);
});
J
