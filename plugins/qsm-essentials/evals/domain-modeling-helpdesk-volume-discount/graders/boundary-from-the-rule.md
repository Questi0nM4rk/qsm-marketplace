---
type: llm
---

Intent of this eval: a person is modelling a help desk and the business rules decide what must stay
consistent; the agent is trusted when it draws the ticket boundary from those rules and rejects a
tenant object that would make every ticket change fight over one lock.

PASS when it draws the ticket boundary from the rules, not from the nouns: the messages and their
read state sit inside the ticket because the reassignment rule needs them to be true together, a
second agent's save is refused by a version check on the ticket and the business decides retry or
merge, and it rejects `Tenant` holding all tickets with the reason (every ticket change on one
tenant would contend on one lock, and no rule needs the whole tenant consistent at once). FAIL when
it accepts the `Tenant` object, makes the tickets and messages separate aggregates that must change
together, or checks the rule in a service.
