---
type: llm
focus: last_message
---

Intent of this eval: a person asks to split a rename across six modules to parallel workers; the
plan is trusted when a naming decision goes to the person with a recommendation and no two workers
can edit the shared file at once.

PASS if both hold: the `Clock` alias question goes to the person with a recommendation and billing
is not left to decide it (billing waits or is dispatched without the alias decision), and the
shared `shared/clock.ts` has one owner or the audit and mail workers run in sequence, so the two
never edit it at once.
FAIL if a worker is left to decide the alias, or audit and mail can both edit `shared/clock.ts`.
