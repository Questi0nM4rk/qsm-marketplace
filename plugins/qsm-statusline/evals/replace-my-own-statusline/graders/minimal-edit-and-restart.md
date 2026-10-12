---
type: llm
focus: trace
---

PASS if the planned change sets only the statusLine key to a command of qsm-statusline render (a
command name, not a path into a plugin directory), leaves the model, permissions and env keys
exactly as they were, and tells the person to restart Claude Code. FAIL if any other key changes,
the command is a path into a plugin directory, or the restart is not mentioned.
