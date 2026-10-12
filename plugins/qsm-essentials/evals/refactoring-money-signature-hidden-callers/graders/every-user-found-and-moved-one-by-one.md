---
type: llm
---

Intent of this eval: a person wants to change a function's signature used in fourteen files, a JSON
config by name and another team's package; the agent is trusted when it finds every user, including
the ones a code search misses, and moves them one small proved step at a time.

PASS when it lists the users from more than the call syntax: a search of the name as text finds
the job config, and it adds the other team's import and the test, doc and script uses, saying that
a code-graph or compiler answer of "no more callers" does not cover a name held in a string or an
outside package. The change is a parallel change: the `Money` form added beside the old, the old
one forwarding to it, one caller moved per step with its run, the old removed last and only when
nothing is left (kept for the other team's package until they move), and the rename or any second
change to the signature is its own sequence. FAIL when it changes the signature in one step, or
lists only the fourteen direct callers.
