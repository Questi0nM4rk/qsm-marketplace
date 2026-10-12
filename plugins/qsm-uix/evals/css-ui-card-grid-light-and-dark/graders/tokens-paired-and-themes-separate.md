---
type: llm
focus: last_message
---

PASS if colours are custom properties, the badge (a fill) takes its text colour from a paired token
and not a loose colour, and the dark values are their own block under prefers-color-scheme with
values chosen for dark, not a white and black swap. FAIL if a component rule holds a loose literal
colour or dark is an inversion.
