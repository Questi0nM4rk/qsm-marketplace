# qsm-langdev-ts

Two skills that teach an agent to write strict TypeScript and Bun code, for a developer who
wants the agent's TypeScript to match theirs.

## Why it exists

A model left alone writes TypeScript that compiles yet leaves meaning in loose strings and numbers.
qsm-langdev-ts ships two skills, `typescript-dev` and `bun-dev`, that add only what the model does
not do unprompted, such as our own types validated where data is mapped into them. It holds that
the language and the runtime it targets are two questions, and a project carries a runtime's
caveats only where that runtime is the one it runs on. It refuses to be a language handbook or to
repeat what the compiler reports. When the agent's unprompted TypeScript is the TypeScript we would
write ourselves, the plugin has no reason to exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `typescript-dev` | Own types validated where data is mapped in, narrowing, Result, branded types, the bun:test idiom |
| Skill | `bun-dev` | Bun runtime traps: `Bun.spawn`, `Bun.$`, `Bun.serve`, `bun build`, `trustedDependencies`, blocking calls |

## Install

```bash
claude plugin install qsm-langdev-ts@qsm-marketplace
```

Installs the skills only. Brings `qsm-langdev` with it: the TypeScript checkers and gate
profile live there, so installing the language brings its gate.

## Use

The skills fire on a TypeScript or Bun ask. You do not call them.

- ask: "parse this JSON into a typed signup and reject bad input"
- ask: "write a bun:test file for this module"
- ask: "spawn a process from Bun and stream its output"
- ask: "build this library with bun build for Node"

## Caveats

- The plugin ships no hooks, linter, or type checker. The gate is `qsm-langdev`'s.
- No lint rules or tsconfig. `qsm-langdev init` writes them.
