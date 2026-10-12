#!/usr/bin/env bash
set -euo pipefail
mkdir -p notes project/docs project/node_modules/retry-kit/src
cd project
cat > package.json <<'J'
{ "name": "app", "private": true, "dependencies": { "retry-kit": "^3.0.0" } }
J
cat > docs/net.md <<'J'
# Network notes

retry-kit retries 10 times with a fixed one second delay (see the v2 docs).
J
cat > node_modules/retry-kit/package.json <<'J'
{ "name": "retry-kit", "version": "3.4.2", "main": "src/fetchWithRetry.js" }
J
cat > node_modules/retry-kit/CHANGELOG.md <<'J'
## 4.0.0
Default retries are now 3 and the delay is linear.

## 3.4.2
Fix a leak in the abort handler.
J
cat > node_modules/retry-kit/src/fetchWithRetry.js <<'J'
// retry-kit: fetch with retries.
//
// Options:
//   retries  how many times to retry after the first attempt
//   base     first delay in milliseconds
//
const DEFAULT_RETRIES = 5;
const DEFAULT_BASE_MS = 200;

// The delay doubles with each attempt.
function delayFor(attempt, base) {
  return base * 2 ** attempt;
}

export async function fetchWithRetry(url, { retries = DEFAULT_RETRIES, base = DEFAULT_BASE_MS } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetch(url);
    } catch (error) {
      if (attempt >= retries) throw error;
      await new Promise((r) => setTimeout(r, delayFor(attempt, base)));
    }
  }
}
J
