---
name: domain-modeling
description: "Use when modelling business rules in code, deciding what is an entity, a value, or an aggregate, drawing a boundary between two meanings of one word, or placing logic between the domain and the database. Triggers: model this domain, entity or value object, aggregate boundary, bounded context, where does this rule live, repository, unit of work, domain event, anemic model, should this be DDD. Module shape without business rules is software-design."
---

# Domain modeling

The code reads like the business talks: same words, same rules, same boundaries. When a business
person reads the type and method names and nods, the model is right. This skill serves a complex
domain whose rules are scattered through controllers and tables, with the questions to ask the
business, the caveats and the edge cases. It adds no ceremony to a simple domain: aggregates,
events and separate contexts only where the business pays for them.

## Questions for the business

- Which part earns the money or sets us apart from a competitor, which part only supports it, and
  which could be bought? Ask for an example of each, because the engineers guess wrong.
- Which words does the business use for the same thing, and which one word means two things to two
  teams? Write the glossary before the types.
- Which rules must be true at every instant, and which may be repaired a minute later? This one
  question draws the aggregate boundaries.
- What happens in the business when two people change the same thing at once, or when a step
  is done twice?
- What must be kept as history (money, audit, law), and what is only current state?

## Rules

- Sort the subdomains first: core (earns the money, volatile) gets the rich model; supporting gets
  plain procedures or CRUD; generic gets a dependency. An aggregate around a lookup table or a
  login page is the dearest way to reinvent it. The ladder for one subdomain, first yes wins:
  money, audit or deep analysis of behaviour needed, so keep the events as the record (event
  sourcing); complex rules, so a domain model; complex data shape but simple rules, an active
  record; else a transaction script. When the pattern and the sorting disagree, the sorting was
  wrong: go back to the business.
- One word, one meaning, inside one boundary. When "customer" is a buyer to sales and a payer to
  billing, those are two contexts and two types. Name the relationship (partnership, customer and
  supplier, conformist, anticorruption layer), because it says who moves when the other changes.
- A context's size follows its model, not a wish for small services: a change that spans two
  contexts means the line is wrong. For a core subdomain still being learned, start wide and split
  when the knowledge arrives, because moving a logical line is cheap and a physical one is not.
- Between contexts translate on purpose: billing receives what it needs through a contract and
  maps it into its own words. It never imports the sales type, because then one change breaks two
  teams. A legacy system's model stays behind an anticorruption layer, because otherwise its
  words leak into the new one.
- Use the business word exactly and rename the code when the business renames the concept,
  because a translation layer between speech and code is a bug farm.
- A value with rules gets a type (money adds only the same currency), immutable and equal by value.
- An invariant is a method on the aggregate that owns the data and refuses ("an order cannot ship
  unpaid"), never a check in a controller, service or trigger, because a rule in three places is
  in none.
- An aggregate is the data that must be consistent together for a rule to hold, behind one root,
  as small as that allows, one per transaction. Test each member: if the rule would give a wrong
  answer on data that is a minute stale, the member belongs inside; if not, it is another
  aggregate, referenced by id. Needing to save two aggregates in one transaction means the line is
  wrong or the rule may be eventual. A rule across aggregates holds eventually, through an event;
  when the business truly says "right now", they are one aggregate.
- Two people changing one aggregate at once is a business question: version the aggregate and
  refuse the stale save, then let the business say whether to retry, merge or reject.
- An event is a past-tense fact in business words (`OrderPaid`), any number of listeners, cannot
  fail. `SendInvoice` is a command: one receiver, may fail. Expect duplicates and wrong order:
  publish through an outbox, give subscribers a way to drop repeats and reorder.
- Across contexts, publish a few deliberate events in the context's own words, not every internal
  event, because subscribers to internals break on each change and copy its logic. Send a full
  state snapshot when the receiver can be stale; send a bare notification and let it query when it
  must read the latest. Never make one context wait a delay for another to finish: trigger the
  second from the first.
- The domain imports no database, web or bus library. A repository is per aggregate root, never
  per table. The application layer is thin functions (load, call domain, save, publish); a
  business `if` there belongs in the domain. Reads may go around the model with a direct query;
  writes go through it.
- Design the aggregate first, then the table.

## Red flags

- When entities are only fields and the rules sit in services, move the rules in, because the
  services are the real domain.
- When every change hangs off one root, split by what must be true together, because a god
  aggregate locks everything.
- When a name is `Manager`, `Helper`, `Processor` or `Dto`, find the business word or delete it.
- When a business `if` sits in an HTTP handler, push it down, because the next handler copies it.
- When the rich model sits on a supporting subdomain, drop to CRUD, because the business does not
  pay for the ceremony.

## Say it in the reply

Before any code, the model in the business's words in five to ten lines: the subdomains with their
type and the pattern each gets, the contexts and their relationship, the aggregates with their
invariants and why each member is inside, the events, and what stays plain CRUD. The user checks it
against how the business talks; if it does not match, no code yet.
