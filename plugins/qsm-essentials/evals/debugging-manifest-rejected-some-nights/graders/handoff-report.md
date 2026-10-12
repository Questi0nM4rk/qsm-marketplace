---
type: llm
---

Intent of this eval: a person is stuck on a file the carrier rejects one night in eight, with no
code to run, and must pass the case to someone who heard nothing; the report is trusted when every
fact has a source, guesses are marked as guesses and the next step says what is needed from whom.

Read only the Report part. PASS when someone who heard nothing else could act on it without a
follow-up question: it says what happened in plain words, every stated fact names where it comes
from (the carrier's rejection, the application log, staging, the team's retry change), what is only
suspected is kept apart from what is known, it says how the cause will be proved before anything
is fixed, and it names what blocks the work and what is needed from whom. FAIL when a suspicion
reads as a fact, a claim has no source, or the report is a list of possible causes with no next
step.
