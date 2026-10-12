---
type: llm
---

PASS only if both hold:

1. The email and the age, values that have rules, get their own types (a brand, a class or a
   value object), built in one place where the request body is mapped. That place rejects bad
   input with a named error or a Result, the parsed JSON is never cast to a user type with `as`,
   and the code after the mapping does not check the rule again.
2. The rest is typed tightly: no `any`, the plan is a literal union and not a bare string, and
   the saving code takes the typed values, not raw strings and numbers.

FAIL if the body is trusted with a cast or an interface alone, or if a loose `string` or `number`
carries the email or age past the mapping.
