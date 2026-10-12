---
type: llm
---

Intent of this eval: a person must bill tenants a volume discount from their monthly ticket count
and an invoice must be explainable to finance; the agent is trusted when billing keeps its own
count, survives duplicate or late facts, records how a line was computed and asks the business what
the threshold means.

PASS when it puts the monthly count and the discount in a billing model of its own, fed by a
ticket-opened fact with the ticket id, and settles the traps that follow: the count is eventually
consistent with the tickets and the business says how stale an invoice may be, the same fact
arriving twice or late must not count a ticket twice or move the 500th ticket across a threshold
wrongly, and the invoice line records the facts (count at the moment, rate applied) so finance can
explain it instead of only a total. It says what is asked of the business: whether the discount
applies to all tickets of the month or only those after the threshold. FAIL when the discount is
computed from a live count read out of the tickets, or no word on duplicates or on explaining a
line.
