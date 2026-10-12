---
type: llm
---

Intent of this eval: a person tells a flaky-failure story where three changes shipped together and
the team's own claims may be wrong; the agent is trusted when it narrows the search with the clues,
says how to rule each guess out and checks claims instead of believing them.

PASS when it narrows the search on purpose instead of listing every possibility: it uses "it worked
before the release" to split the three changes (revert or isolate one at a time, or bisect between
the last good and first bad build), ties each of at most three hypotheses to a clue it was given
(the parallel workers and the nondeterminism, staging versus production, the formatting library and
the fixed width, the base image and locale or time), and says for each what check would rule it out,
treating what the team told it (the logged weights match, it is fixed) as claims to check rather
than facts. FAIL when the hypotheses come with no way to tell them apart, or when one is declared
the cause with nothing that would prove it.
