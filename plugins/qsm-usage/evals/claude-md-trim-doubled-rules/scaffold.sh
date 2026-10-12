#!/usr/bin/env bash
# Seeds a small invoicing project and a long CLAUDE.md with doubled and overlapping rules.
set -euo pipefail
mkdir -p src/api src/billing src/generated src/lib docs scripts
printf '{\n  "name": "ledgerly",\n  "scripts": {\n    "build": "tsc -p .",\n    "test": "vitest run",\n    "lint": "eslint .",\n    "migrate": "node scripts/migrate.js",\n    "db:reset": "node scripts/reset.js"\n  },\n  "dependencies": {"express": "^4.19.0", "pg": "^8.12.0", "zod": "^3.23.0"},\n  "devDependencies": {"typescript": "^5.6.0", "vitest": "^2.1.0", "eslint": "^9.0.0", "prettier": "^3.3.0"}\n}\n' > package.json
printf '{ "semi": true, "singleQuote": true, "tabWidth": 2, "trailingComma": "all" }\n' > .prettierrc
printf 'export default [{ rules: { "no-unused-vars": "error", "eqeqeq": "error", "no-console": "warn" } }];\n' > eslint.config.js
printf '{ "compilerOptions": { "strict": true, "target": "ES2022", "outDir": "dist" } }\n' > tsconfig.json
for f in src/api/invoices.ts src/api/customers.ts src/billing/totals.ts src/billing/tax.ts src/lib/db.ts src/generated/schema.ts scripts/migrate.js scripts/reset.js; do printf '// %s\nexport {};\n' "$f" > "$f"; done
printf '# Payments\n\nThe provider retries a webhook for 72 hours.\n' > docs/payments.md
cat > CLAUDE.md <<'EOF'
# Ledgerly

Ledgerly is an invoicing service for small shops. This file is loaded in every session.

## About the project

Ledgerly lets a shop create invoices, send them to customers, and record payments.
It is a TypeScript service on Node with a Postgres database.

## Directory layout

```text
src/
  api/          HTTP handlers: invoices.ts, customers.ts
  billing/      totals.ts, tax.ts
  generated/    schema.ts (generated, do not edit)
  lib/          db.ts
docs/           payments.md
scripts/        migrate.js, reset.js
```

## Tech stack

- TypeScript 5.6 in strict mode
- Express 4 for HTTP
- pg for Postgres access
- zod for validation
- vitest for tests
- ESLint 9 and Prettier 3

## Commands

- Install dependencies: `npm install`
- Build: `npm run build`
- Run the tests: `npm test`
- Lint: `npm run lint`
- Migrate the local database: `npm run migrate -- --env=local` (the flag is required, without it the
  script runs against whatever DATABASE_URL points to)
- Reset the local database: `npm run db:reset -- --yes` (wipes all local data)

## Code style

- Write clean, readable code.
- Use 2 spaces for indentation.
- Always use semicolons.
- Use single quotes for strings.
- Use trailing commas in multi-line literals.
- Prefer small functions with clear names.
- Handle errors properly and never swallow them.
- Do not leave unused variables or imports.
- Use `===` instead of `==`.
- Avoid `console.log` in committed code.

## Money

- Amounts are integer cents, never floats. We moved to integer cents after a rounding error
  produced invoices that were off by one cent per line, and the totals no longer matched the
  provider's.
- Tax is computed per line and then summed, because the provider rounds per line.
- Never log customer emails or card fragments.

## Testing

- Write a test for every bug fix.
- Run the tests before every commit.
- Tests live next to the code as `*.test.ts`.
- Never mock the database in billing tests, use the local Postgres; a mocked database hid a broken
  migration once.

## Workflow

- Branch names: `feat/<ticket>-<slug>` or `fix/<ticket>-<slug>`.
- Commit messages: imperative mood, first line under 72 characters.
- Run the tests before every commit.
- Keep pull requests small and focused.
- Squash on merge.

## Git

- Never force-push `main`.
- Never commit `.env` files or secrets.
- Do not commit generated files except `src/generated/schema.ts`.

## Security

- Never commit `.env` files or secrets.
- Validate every request body with zod at the handler boundary.
- Never log customer emails or card fragments.

## Generated code

- Never edit anything in `src/generated/`. Run `npm run build` to regenerate it; edits are
  overwritten and the build then fails on the checksum.

## Documentation

- Payment webhook behaviour is in @docs/payments.md. Read it before touching `src/api/invoices.ts`.

## General advice

- Think before you code.
- Ask when a requirement is unclear.
- Keep functions short and focused.
- Write clean, readable code.
EOF
