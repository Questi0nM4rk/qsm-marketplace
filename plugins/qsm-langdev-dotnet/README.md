# qsm-langdev-dotnet

A skill that teaches an agent to write C# 14 on .NET 10, for a developer who wants the agent's
C# to match theirs.

## Why it exists

A model left alone writes C# from older habits than the SDK in use, and the compiler's analyzers
cannot make the choices between records and classes, scoped and singleton, or what C# 14 added.
qsm-langdev-dotnet holds only those choices and the xUnit test idiom, with the language, and
nowhere general. It refuses to be the framework's documentation or a substitute for the compiler.
The gate that checks the result, and the knowledge that this project speaks C#, are
qsm-langdev's. When the agent's unprompted C# is the C# we would write ourselves, the skill has no
reason to exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `dotnet-dev` | C# 14 features, records against classes, nullable types, async, DI lifetimes, and the xUnit idiom |

## Install

```bash
claude plugin install qsm-langdev-dotnet@qsm-marketplace
```

Installs the skill only. Brings `qsm-langdev` with it: the C# checkers and gate profile live
there, so installing the language brings its gate.

## Use

The skill fires on a C# ask. You do not call it.

- ask: "write a C# service that reads orders and cancels on a token"
- ask: "should this be a record or a class?"
- ask: "rename this method and find its callers"
- ask: "write an xUnit test for this class, as a Theory"

## Caveats

- The plugin ships no hooks, linter, or type checker. The gate is `qsm-langdev`'s.
- No ASP.NET Core or EF Core guidance.
- The skill expects C# language server tools from the harness for rename and find-callers.
