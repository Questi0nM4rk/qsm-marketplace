---
type: llm
---

Intent of this eval: customers received two copies of a statement although the team says duplicates
cannot happen; the agent is trusted when it shows from the clues how a slow job and a
check-then-send guard let both workers send, and makes the sending itself safe to repeat.

PASS when it does not accept the team's "duplicates cannot happen" and shows why from the clues:
a job over 60 seconds returns to the queue while its first worker is only slow, so two workers
hold the same job, and a check of "sent" followed by sending is a check then act that both pass
before either records it. The fix it names makes the effect itself safe against a repeat (an atomic
claim or a unique key per statement taken before the email goes out, or an idempotency key at the
mail provider), and it says what can still repeat because an email cannot be unsent. FAIL when it
only raises the 60 seconds, or keeps the check as the protection.
