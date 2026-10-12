---
name: typescript-dev
description: "Use before writing or explaining strict TypeScript, and before writing a bun:test file: our own types validated where data is mapped into them, narrowing instead of casting, Result instead of throwing, branded types, using for cleanup, the compiler-cost traps (interface vs intersection, const enum, tsgo), and the bun:test idiom. Triggers: writing TypeScript, idiomatic TS, type narrowing, discriminated union, branded type, Result type, parse JSON into a type, tsconfig strictness, interface vs type, const enum, tsgo, TypeScript 7, write a test in bun test, describe and it, mock in bun test, run only this test. Bun runtime APIs are bun-dev; which cases to test is software-testing."
---

# Writing TypeScript

Strict TypeScript for this machine, typed with our own types: a value with rules gets a type that
validates once, where outside data is mapped into it, so code past that line holds a value that
cannot be invalid. The compiler and lint gate reject the rest; this skill holds the choices they
cannot make. Out of scope: a tutorial, Bun APIs (bun-dev).

The gate: `qsm-langdev init` writes `tsconfig.qsm.json` and `biome.jsonc`, which require `strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` and `??` over `||`.
Write against them; do not restate them in code or prose. A repository may opt into
`isolatedDeclarations` (explicit return type on every export) and `erasableSyntaxOnly` (no enums,
no namespaces with code, no parameter properties).

## Our own types, validated at the mapping

A string that is an email, a number that is an age, an id that must not be swapped: each gets its
own type, built by one parse function that is the only place the rule is written and the only
cast. The mapping from `unknown` is where it fails, with a named error, so nothing past it
re-checks.

```ts
type Email = string & { readonly __brand: "Email" };
class InvalidEmail extends Error { override readonly name = "InvalidEmail"; }
const parseEmail = (raw: unknown): Result<Email, InvalidEmail> =>
  typeof raw === "string" && /^[^@\s]+@[^@\s]+$/.test(raw)
    ? { ok: true, value: raw as Email }
    : { ok: false, error: new InvalidEmail(String(raw)) };
```

The record that holds the parsed fields is a plain type built from those values, never
`JSON.parse(raw) as User`. A closed set (`"free" | "pro"`) is a literal union checked at the same
place. Parse the environment once at startup the same way.

## Rules

- Narrow with a type predicate, never cast, because a cast moves the crash to run time. Close every
  union with `assertNever(x: never)`, so a missing arm is a compile error.
- Narrow a `catch` binding (`unknown`) with `instanceof Error`, and rethrow with `{ cause: err }`.
- Return `{ ok: true; value } | { ok: false; error }` for a failure the caller handles; throw only
  for what nobody can handle, because a throw is invisible in the type. Give a domain failure its
  own class with a `name`.
- Make a state with behaviour its own type, not an enum, because an enum cannot own its transitions.
- Use `using` and `await using` instead of `try/finally` for a resource with an owner.
- Use `interface ... extends` over an intersection, because it is cached and gives shorter errors.
- Never use `const enum`; use `{ Up: "Up" } as const` plus `(typeof X)[keyof typeof X]`, because
  esbuild, swc, Bun and tsgo cannot inline it across files.
- Before moving to tsgo (TypeScript 7), turn on `isolatedModules`, because tsgo checks files in
  isolation and code that compiles only through tsc's cross-file inference breaks. A `TS6xxx`
  deprecation in 6.x is a blocker, and an orphaned `references[]` entry now errors.

## Tests in bun:test

One file per unit, `order-service.test.ts`, with test data that shows only what matters, built by a
small factory (`aUser({ active: false })`), because a shared twenty-field fixture breaks fifty
tests at once. Whether a test is needed is software-testing.

- Import `describe`, `it`, `expect` from `bun:test`, never rely on globals. `describe` names the
  unit, `it` the case as a sentence, two levels at most.
- `beforeEach` builds fresh state; `beforeAll` only for expensive read-only setup, because mutated
  shared state is the first flaky test.
- `it.each` with the row in the title, so the report says which input failed.
- `await expect(p).rejects.toThrow("msg")`; an unawaited promise passes before it fails.
- Pass a dependency in rather than `mock.module`, which replaces a module for the whole file;
  `spyOn` wraps one method, and `mock.restore()` goes in `afterEach`.
- `setSystemTime(date)` around code that reads the clock, `setSystemTime()` after, never
  `Bun.sleep` to wait for time.
- Run one file `bun test order-service`, one test `bun test -t "rejects payment"`.

## Red flags

- When a test still passes with the code under test deleted, assert the result, because it proves
  nothing.
- When a `string` or `number` carries a domain meaning past the parse, give it a type, because the
  next caller will pass the wrong one.

## Say it in the reply

When you avoided a cast, an enum or a throw, say what replaced it, and name the one place each
value is validated. For a test file: file, count, and the command that runs it.
