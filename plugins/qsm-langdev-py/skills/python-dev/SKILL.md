---
name: python-dev
description: "Use when writing or explaining Python on 3.14: deferred annotations, PEP 695 generics and the type statement, Protocol over ABC, dataclass against TypedDict against NamedTuple, TypeIs, exception groups, and the uv and ruff toolchain. Triggers: writing Python, write a pytest test, fixture, parametrize, type hints, Protocol, dataclass, TypedDict, generics, type alias, TypeIs, ExceptionGroup, except*, uv, pyproject. pytest idiom is here; which cases to test is software-testing."
---

# Writing Python

Python for this machine's 3.14, typed and clean: ruff, pyright, bandit and vulture reject what is
wrong, and this skill covers the typing choices they do not make and the features newer than your
habits. It is not a tutorial.

## Annotations are deferred

3.14 evaluates an annotation only when asked, so a forward reference needs no quotes and
`from __future__ import annotations` is obsolete. Read annotations through
`annotationlib.get_annotations(f, format=Format.STRING)`, never `__annotations__`, because the
attribute now triggers evaluation.

## Generics without TypeVar

Declare the parameter where it is used, so no module-level `TypeVar` has to be kept in sync:

```python
def first[T](xs: list[T]) -> T: ...
class Box[T]: ...
type Handler = Callable[[Request], Response]   # a real, lazily evaluated alias
```

## Choosing the shape

| Need | Use |
| --- | --- |
| a value with behaviour and validation | `@dataclass(frozen=True, slots=True)` |
| a JSON object shape at a boundary | `TypedDict`, but parse outside data with a schema |
| a named tuple unpacked by position | `NamedTuple` |

Prefer `Protocol` to an ABC, because the dependency then points at the caller; use an ABC only for
shared implementation. `frozen` makes the instance hashable, `slots` turns a typo on assignment
into an `AttributeError`. A `TypedDict` is checked only by the type checker, so on data from
outside the process it is a claim nobody verified.

Accept the abstract type and return the concrete one: `Sequence[str]` takes a tuple, `list[str]`
demands a list and implies mutation.

## Our own types, validated where data enters

A value with rules (an email, an amount, an id) gets its own type, and the rule is written once, in
the constructor or one `parse_*` function at the place outside data is mapped in, so code past it
holds a value that cannot be invalid. A loose `str` or `int` never carries a domain meaning past
that line. Annotate every parameter and return, write no `Any`, and let a function do one thing:
parse, decide, store are three functions, not one.

```python
@dataclass(frozen=True, slots=True)
class Email:
    value: str
    def __post_init__(self) -> None:
        if "@" not in self.value:
            raise InvalidEmail(self.value)
```

## Narrowing and errors

Prefer `TypeIs` to `TypeGuard`, because it narrows the negative branch too. End a `match` or an
if-chain over a union with `assert_never`, so a missing branch is a type error.

Raise the most specific exception and chain with `from err`. Use `ExceptionGroup` and `except*`
when independent operations can each fail and the caller needs every failure. A `finally` never
returns or raises, because that discards the exception in flight.

## Toolchain

`uv` owns the interpreter, the environment, the lockfile and tool installs; `uv sync` from a
committed `uv.lock` is what makes two machines agree. One `pyproject.toml` holds the metadata and
tool config, and `qsm-langdev init` writes `ruff.toml`, `pyrightconfig.json` and `bandit.yaml`
beside it. Run `python -m pytest`, not a path, because the path form uses whatever interpreter is
first on `PATH`.

## Tests in pytest

A plain function `test_<behaviour>` in `test_<unit>.py`, a bare `assert`, no class and no
`unittest`. Whether a test is needed is software-testing.

- Share setup with a `@pytest.fixture`, scoped as narrowly as it can be; a `yield` fixture cleans
  up even when the test fails. Put shared ones in `conftest.py`, never import them.
- One promise over many inputs is `@pytest.mark.parametrize` with `ids=`, so the report names the
  input that failed.
- Use `tmp_path` for files and `monkeypatch` for environment and attributes, because both undo
  themselves; a hand-patched global leaks into the next test.
- `with pytest.raises(Err, match="text")`, and check the message too.
- A hand-written fake over `unittest.mock`, and never verify a call the result already proves.
- Run one test `python -m pytest path::test_name`, or by keyword `-k rejects`.

## Say it in the reply

When a 3.14 feature replaced an older spelling (no quotes, `type`, `[T]`), say so in a clause, and
name the one place each domain value is validated.
