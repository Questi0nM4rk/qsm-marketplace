---
type: llm
focus: trace
---

PASS when evals/ holds a case that checks the skill loads (a tool_used grader on Skill limited to
the with-plugin arm), a scenario case with a problem of several steps graded on the agent's work,
and a negative case that expects zero uses of the skill.
