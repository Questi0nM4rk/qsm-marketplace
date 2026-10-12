---
type: llm
---

PASS only if all hold:

1. Typing: every function parameter and return is annotated, there is no `Any`, and the values
   that have rules (the email, the amount, the currency) are their own types or fields of a
   frozen dataclass, with the rule checked once where the JSON is mapped in and a named
   exception raised there. A bare `dict` or `TypedDict` is not trusted as the validated invoice.
2. Clean code: parsing, deciding and storing are separate functions, the store is a parameter
   (a Protocol or a callable) and not a hidden global, and there is no mutable default argument.
3. It uses modern syntax with no ceremony: no quoted forward references, no module-level
   `TypeVar` for a generic.

FAIL if any is missing.
