#!/usr/bin/env bash
# A small Bun project with no wt configuration yet, and a stand-in personal config directory.
mkdir -p src home/.config/worktrunk
cat > package.json <<'JSON'
{
  "name": "orders-service",
  "type": "module",
  "scripts": {
    "lint": "biome check",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": { "zod": "^4.0.0" }
}
JSON
printf 'export const answer = 42;\n' > src/index.ts
printf '# personal wt config\n' > home/.config/worktrunk/config.toml
