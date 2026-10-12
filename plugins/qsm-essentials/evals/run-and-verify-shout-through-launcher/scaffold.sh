#!/usr/bin/env bash
set -euo pipefail
mkdir -p app/src app/test app/bin
cd app
cat > package.json <<'J'
{ "name": "greet", "private": true, "scripts": { "test": "bun test" } }
J
cat > src/greet.ts <<'J'
export function greet(name: string): string {
  return `Hello ${name}`;
}
J
cat > src/cli.ts <<'J'
import { greet } from "./greet.ts";

const name = process.argv[2] ?? "world";
console.log(greet(name));
J
cat > bin/greet <<'J'
#!/usr/bin/env bash
exec bun "$(dirname "$0")/../src/cli.ts" "$1"
J
chmod +x bin/greet
cat > test/greet.test.ts <<'J'
import { expect, test } from "bun:test";
import { greet } from "../src/greet.ts";

test("greets by name", () => {
  expect(greet("Ada")).toBe("Hello Ada");
});
J
