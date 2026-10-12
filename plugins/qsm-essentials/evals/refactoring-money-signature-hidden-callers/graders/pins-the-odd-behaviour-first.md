---
type: llm
---

Intent of this eval: a person wants a refactoring that changes no behaviour even where the current
behaviour is odd; the agent is trusted when it records what the real flows do today, odd output
included, proves each step against that, and leaves fixing the rounding to a separate decision.

PASS when the first step runs the real flows (checkout, renewal, the job through the config) and
keeps their output as they are, 1998 cents included, and the later steps are proved against that
output: the `Money` form must still produce 1998 for 19.99 while it is a refactoring, and fixing
the rounding is a separate behaviour commit the person decides. It does not accept "Money in cents
makes it right anyway". FAIL when it fixes the rounding inside the refactoring, writes the first
step as editing code, or pins only with the one unit test.
