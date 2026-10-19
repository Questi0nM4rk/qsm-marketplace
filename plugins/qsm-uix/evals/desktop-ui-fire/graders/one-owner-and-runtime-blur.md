---
type: llm
focus: last_message
---

Intent of this eval: the person wants the Hyprland layer rule set so that one owner animates each
surface, and would trust a reply that keeps the compositor and the shell from both animating.

PASS if the reply gives each surface exactly one animation owner (a surface opened from a trigger
animates in the shell with `no_anim = true` on its namespace; a surface with no trigger may use the
compositor's layer leaves) and, if it mentions blur, sets it at runtime by a named rule rather than
a standing rule. FAIL if both owners animate one surface or a standing blur rule is proposed.
