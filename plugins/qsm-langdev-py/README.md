# qsm-langdev-py

A skill that teaches an agent to write typed, clean Python 3.14 and pytest tests, for a
developer who wants the agent's Python to match theirs.

## Why it exists

A model left alone writes Python with loose hints and untidy structure. qsm-langdev-py ships one
skill that adds only what that unprompted run gets wrong on typing and clean code, plus the pytest
test idiom. It takes the stance that the agent's own Python is the baseline, and it refuses to be
the language reference, a substitute for the type checker, or a gate: it ships no hooks, no bin,
no linter and no type checker. The checkers and the gate profile for Python live in
`qsm-langdev`, which this plug-in depends on, so installing the language brings its gate. When the
agent's unprompted Python is the Python we would write ourselves, the plug-in has no reason to
exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `python-dev` | Deferred annotations, PEP 695 generics, dataclass against TypedDict, narrowing, uv and ruff, the pytest idiom |

## Install

```bash
claude plugin install qsm-langdev-py@qsm-marketplace
```

Installs the skill only. Brings `qsm-langdev` with it: the Python checkers and gate profile
live there, so installing the language brings its gate.

## Use

The skill fires on a Python ask. You do not call it.

- ask: "write a dataclass for an invoice and parse it from JSON"
- ask: "make this generic with the new type syntax"
- ask: "write a pytest test with parametrize for this function"
- ask: "set up this project with uv"

## Caveats

- The plugin ships no hooks, linter, or type checker. The gate is `qsm-langdev`'s.
- No lint rules. `qsm-langdev init` writes them.
- No web framework or ORM guidance.
