---
name: bun-dev
description: "Use when writing or explaining Bun code: Bun.file, Bun.spawn, Bun.$ shell, Bun.serve, bun build targets, .env loading, trustedDependencies, bun:ffi, and the blocking calls that stall a server. Triggers: Bun runtime API, spawn a process, serve HTTP, bun build, bun.lock, Bun.$ shell, import.meta.dir, bun:ffi, trustedDependencies. TypeScript idioms and bun:test are typescript-dev."
---

# Writing Bun

Bun code for this machine: a `Bun.*` native comes before a Node shim or a dependency, because each
native is one less package to install. This skill holds only the traps the model gets wrong, not
the API. Out of scope: TypeScript idioms (typescript-dev).

## Rules

- Use `Bun.$` for commands built from data, because it escapes every interpolated value. Never put
  user input in `${{ raw: ... }}`. Add `.nothrow()` when a non-zero exit is an answer.
- Call `proc.unref()` on a `Bun.spawn` child the parent must not wait for, because Bun stays alive
  until every child exits. `Bun.spawnSync` is for CLIs and build scripts, never a server, because it
  blocks the event loop.
- Use `node:fs/promises` for directories; `Bun.file()` covers files only. `.end()` every
  `.writer()`, or the process never exits.
- Set `"type": "module"` in package.json, or `.js` parses as CommonJS.
- Commit `bun.lock`, never `bun.lockb`, and use `bun add` and `bun run`, because `npm` writes a
  lockfile Bun does not read.
- List a package that needs a postinstall script in `"trustedDependencies"`, because Bun skips the
  script silently.
- Delete `dotenv`. Bun loads `.env`, `.env.local` and `.env.{NODE_ENV}` itself; read `Bun.env.X`.
- Use `import.meta.dir`, never `__dirname`, which throws under ESM.
- Serve Bun consumers source and others a build with
  `{ "bun": "./src/index.ts", "import": "./dist/index.js" }` in `exports`.
- Build with `--target=bun` for a CLI or server, `node` for a package Node consumers install.
  Add `--splitting` for dynamic imports. In CI call `Bun.build()` and read `result.logs`, because
  an exit code carries no message or position.
- Stream a large file with `Bun.write(Bun.stdout, Bun.file(path))`, not into a string, which fills
  the JS heap.
- Set `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0` in Docker and on read-only filesystems, because the
  cache fails or serves a stale hit there.
- Prefer a Node-API `.node` addon to `bun:ffi`, which is experimental; `close()` every `JSCallback`.

## Red flags

- When you reach for `node:http`, `bcrypt`, `dotenv` or `child_process`, use the `Bun.*` native,
  because that is the stance of this marketplace.

## Say it in the reply

When you choose a `Bun.*` native over a dependency or a Node module, name what it replaces.
