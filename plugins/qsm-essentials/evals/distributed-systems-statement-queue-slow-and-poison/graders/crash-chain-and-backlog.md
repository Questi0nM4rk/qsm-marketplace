---
type: llm
---

Intent of this eval: a person's billing queue stopped for six hours after every worker crashed in
turn, and they need the real cause; the agent is trusted when it sees one poisonous job killing each
worker that takes it and fixes that, instead of adding workers or timeouts.

PASS when it explains why all eight workers died one after another from one cause (a returned job
that kills whoever takes it next), ties it to the clue that nobody looked at the job in hand, and
asks for that job first. The change it names counts deliveries per job, backs off, and parks the
job after a limit for a person, with an alert. For the six-hour stall and the late newest
statements it separates retried jobs from new ones (a second queue or a priority) or drops jobs
past an age, so new work does not wait behind the retries. FAIL when the answer is more workers, a
longer timeout or an automatic restart only.
